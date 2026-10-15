import {runCatalogImageChecks} from "./catalog-images.integration.mjs";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";

export async function runActivityPosChecks({db,call,resource,register}){
 const activities=["cafe","sweets","grocery","clothing","perfume","accessories","gifts","ecommerce","carwash","laundry","automotive","salon","publicworks"];
 const services=new Set(["carwash","laundry","automotive","salon","publicworks"]);
 const fixtures=[];
 const ok=(r,status=201)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
 const stock=async(id)=>{const [[r]]=await db.execute("SELECT stock_quantity FROM catalog_products WHERE id=?",[id]);return Number(r.stock_quantity);};
 for(const activity of activities){
  const owner=await register("catalog-pos-"+activity,activity);
  await db.execute("UPDATE tenant_subscriptions SET plan_id='operations-enterprise' WHERE tenant_id=?",[owner.tenant]);
  await db.execute("UPDATE tenant_business_profiles SET currency='USD' WHERE tenant_id=?",[owner.tenant]);
  const catalog=(method,body)=>call("/api/restaurant/activity-catalog",method,body,owner.cookie,owner.tenant);
  const category=ok(await catalog("POST",{kind:"category",name:"Category "+activity})).id;
  const product=ok(await catalog("POST",{kind:"product",name:"Product "+activity,categoryId:category,price:7.25})).id;
  ok(await catalog("PATCH",{kind:"product",id:product,stockQuantity:5}),200);
  const listed=ok(await catalog("GET"),200);assert.equal(listed.currency,"USD");assert.equal(listed.products[0].currency,"USD");
  const pos=ok(await call("/api/restaurant/operations/pos?branch="+owner.branch,"GET",undefined,owner.cookie,owner.tenant),200);
  assert.equal(pos.catalogSource,"activity");assert.equal(pos.currency,"USD");assert.equal(pos.menu.find(p=>p.id===product).data.price,7.25);
  if(activity!=="cafe")assert.equal(pos.tables.length,0);
  const sale={branchId:owner.branch,currency:"USD",channel:"takeaway",requestKey:randomUUID(),items:[{id:product,quantity:2,price:0}],total:0};
  const [first,replay]=await Promise.all([resource(owner,"pos",sale),resource(owner,"pos",sale)]);
  const order=ok(first);ok(replay);assert.equal(order.id,replay.body.id);assert.equal(order.total,14.5);assert.equal(order.currency,"USD");
  assert.equal(await stock(product),services.has(activity)?5:3);
  const rows=ok(await resource(owner,"orders",undefined,"GET"),200).orders;
  const saved=rows.find(o=>o.id===order.id);assert.equal(saved.currency,"USD");assert.equal(saved.items[0].price,7.25);
  ok(await catalog("PATCH",{kind:"product",id:product,price:99}),200);
  assert.equal(ok(await resource(owner,"orders",undefined,"GET"),200).orders.find(o=>o.id===order.id).items[0].price,7.25);
  const invoice=ok(await resource(owner,"customerInvoices",{name:"Invoice "+activity,status:"draft",branchId:owner.branch,data:{orderId:order.id,subtotal:14.5,taxAmount:0,serviceFee:0}}));
  const invoices=ok(await resource(owner,"customerInvoices",undefined,"GET"),200).resources;
  assert.equal(invoices.find(i=>i.id===invoice.id).currency,"USD");
  assert.equal((await resource(owner,"customerInvoices",{name:"Wrong amount",status:"draft",branchId:owner.branch,data:{orderId:order.id,subtotal:1,taxAmount:0,serviceFee:0}})).status,400);
  const [[reference]]=await db.execute("SELECT enabled FROM restaurant_menu_items WHERE id=?",[product]);assert.equal(Number(reference.enabled),0);
  fixtures.push({owner,product,category,sale,order,saved,catalog});
 }
 const a=fixtures.find(f=>f.owner.email.startsWith("catalog-pos-grocery")),b=fixtures.find(f=>f.owner.email.startsWith("catalog-pos-clothing"));
 const {owner,product,category,sale,catalog}=a;
 const request=(changes={})=>({...sale,requestKey:randomUUID(),...changes});
 assert.equal((await resource(b.owner,"pos",request({branchId:b.owner.branch}))).body.code,"ITEM_UNAVAILABLE");
 assert.equal((await call("/api/restaurant/operations/pos","GET",undefined,b.owner.cookie,owner.tenant)).status,403);
 assert.equal((await resource(owner,"pos",request({currency:"EUR"}))).body.code,"CURRENCY_CHANGED");
 assert.equal((await resource(owner,"pos",request({channel:"dine_in",partySize:1,tableId:randomUUID()}))).body.code,"PLAN_FEATURE_REQUIRED","server table entitlement denies dining before channel validation");
 await db.execute("UPDATE catalog_products SET currency='EUR' WHERE id=?",[product]);
 assert.equal((await resource(owner,"pos",request())).body.code,"UNSUPPORTED_CURRENCY");
 await db.execute("UPDATE catalog_products SET currency='USD',price=7.25 WHERE id=?",[product]);
 ok(await catalog("PATCH",{kind:"category",id:category,enabled:false}),200);
 assert.equal((await resource(owner,"pos",request())).body.code,"ITEM_UNAVAILABLE");
 ok(await catalog("PATCH",{kind:"category",id:category,enabled:true}),200);
 ok(await catalog("PATCH",{kind:"product",id:product,enabled:false}),200);
 assert.equal((await resource(owner,"pos",request())).body.code,"ITEM_UNAVAILABLE");
 ok(await catalog("PATCH",{kind:"product",id:product,enabled:true}),200);
 const foreignBranch=randomUUID();await db.execute("INSERT INTO branches(id,tenant_id,name,slug,enabled) VALUES (?,?,?,'catalog-second',TRUE)",[foreignBranch,owner.tenant,"Second branch"]);
 for(const [table,id] of [["catalog_products",product],["catalog_categories",category]]){
  await db.execute("UPDATE "+table+" SET branch_id=? WHERE id=?",[foreignBranch,id]);
  const pos=ok(await call("/api/restaurant/operations/pos?branch="+owner.branch,"GET",undefined,owner.cookie,owner.tenant),200);
  assert.ok(!pos.menu.some(p=>p.id===product));assert.equal((await resource(owner,"pos",request())).body.code,"ITEM_UNAVAILABLE");
  await db.execute("UPDATE "+table+" SET branch_id=NULL WHERE id=?",[id]);
 }
 assert.equal((await resource(owner,"pos",request({items:[{id:product,quantity:4}]}))).body.code,"INSUFFICIENT_STOCK");
 assert.equal(await stock(product),3);
 const rollbackKey=randomUUID();
 assert.equal((await resource(owner,"pos",request({requestKey:rollbackKey,items:[{id:product,quantity:1},{id:"z".repeat(36),quantity:1}]}))).body.code,"ITEM_UNAVAILABLE");
 assert.equal(await stock(product),3);
 const [[rolledBack]]=await db.execute("SELECT COUNT(*) AS n FROM restaurant_orders WHERE tenant_id=? AND request_key=?",[owner.tenant,rollbackKey]);assert.equal(Number(rolledBack.n),0);
 // Catalog source wins even when this tenant also has an independently edited legacy menu.
 const legacyCategory=ok(await resource(owner,"categories",{name:"Legacy category",status:"active",branchId:owner.branch,data:{}})).id;
 const legacyItem=ok(await resource(owner,"menu",{name:"Legacy wrong source",status:"active",branchId:owner.branch,data:{categoryId:legacyCategory,price:123}})).id;
 assert.ok(!ok(await resource(owner,"pos",undefined,"GET"),200).menu.some(p=>p.id===legacyItem));
 assert.equal((await resource(owner,"pos",request({items:[{id:legacyItem,quantity:1}]}))).body.code,"ITEM_UNAVAILABLE");
 // Cancellation returns only the quantities recorded by the committed creation event.
 const current=ok(await resource(owner,"orders",undefined,"GET"),200).orders.find(o=>o.id===a.order.id);
 ok(await resource(owner,"orders",{id:current.id,version:current.version,status:"cancelled"},"PATCH"),200);assert.equal(await stock(product),5);
 assert.equal((await resource(owner,"orders",{id:current.id,version:current.version,status:"cancelled"},"PATCH")).body.code,"CONFLICT");
 ok(await resource(owner,"pos",sale));assert.equal(await stock(product),5);
 // Two different actors race for the final physical item; the row lock prevents overselling.
 await db.execute("INSERT INTO memberships(id,user_id,tenant_id,role,status) VALUES (?,?,?,'manager','active')",[randomUUID(),b.owner.user,owner.tenant]);
 const secondActor={...owner,cookie:b.owner.cookie};
 await db.execute("UPDATE catalog_products SET stock_quantity=1 WHERE id=?",[product]);
 const race=await Promise.all([resource(owner,"pos",request({items:[{id:product,quantity:1}]})),resource(secondActor,"pos",request({items:[{id:product,quantity:1}]}))]);
 assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);assert.ok(["CONFLICT","INSUFFICIENT_STOCK"].includes(race.find(r=>r.status===409)?.body.code),JSON.stringify(race.map(r=>({status:r.status,code:r.body.code}))));assert.equal(await stock(product),0);
 // Required catalog options use their own prices and finite stock, with rollback on failure.
 const group=randomUUID(),option=randomUUID();
 await db.execute("INSERT INTO catalog_option_groups(id,tenant_id,product_id,name_ar,required,min_select,max_select) VALUES (?,?,?,'Size',TRUE,1,1)",[group,owner.tenant,product]);
 await db.execute("INSERT INTO catalog_option_values(id,tenant_id,group_id,name_ar,price_delta,stock_quantity) VALUES (?,?,?,'Large',2.50,1)",[option,owner.tenant,group]);
 await db.execute("UPDATE catalog_products SET stock_quantity=4 WHERE id=?",[product]);
 assert.equal((await resource(owner,"pos",request({items:[{id:product,quantity:1}]}))).body.code,"INVALID_OPTIONS");
 assert.equal((await resource(owner,"pos",request({items:[{id:product,quantity:2,options:[option]}]}))).body.code,"INSUFFICIENT_STOCK");assert.equal(await stock(product),4);
 const variant=ok(await resource(owner,"pos",request({items:[{id:product,quantity:1,options:[option]}]})));assert.equal(variant.total,9.75);assert.equal(await stock(product),3);
 const variantRow=ok(await resource(owner,"orders",undefined,"GET"),200).orders.find(o=>o.id===variant.id);
 ok(await resource(owner,"orders",{id:variant.id,version:variantRow.version,status:"cancelled"},"PATCH"),200);assert.equal(await stock(product),4);
 const [[restoredOption]]=await db.execute("SELECT stock_quantity FROM catalog_option_values WHERE id=?",[option]);assert.equal(Number(restoredOption.stock_quantity),1);
 console.info("Activity POS: 13 catalogs, server prices/currencies, invoices, idempotency, isolation, rollback, stock race and variant restoration verified");
 await runCatalogImageChecks({db,call,owner,product,foreign:fixtures.find(f=>f.owner.email.startsWith("catalog-pos-perfume")).owner});
 return fixtures;
}

