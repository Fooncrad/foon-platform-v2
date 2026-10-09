import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import mysql from "mysql2/promise";
import {resourceModules} from "./restaurant-resource-schema.mjs";
import {randomUUID} from "node:crypto";
const origin="http://localhost:3103";
test("restaurant operations preserve tenant, role, plan, pricing and transactional integrity",async()=>{
 const url=new URL(process.env.DATABASE_URL||"");assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/foon_migration_test");
 const db=await mysql.createConnection(url.href);
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3103"],{env:{...process.env,APP_URL:origin},stdio:"ignore"});
 const password="a-strong-test-password";
 const call=async(path,method,body,cookie,tenant)=>{
  const r=await fetch(origin+path,{method,headers:{origin,"content-type":"application/json",...(cookie?{cookie}:{}),...(tenant?{"x-foon-tenant":tenant}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return{status:r.status,body:await r.json(),cookie:r.headers.get("set-cookie")?.split(";")[0]};
 };
 const register=async(name)=>{const r=await call("/api/auth/register","POST",{name,storeName:name,slug:name,email:name+"@test.example",password,kind:"restaurant"});assert.equal(r.status,201,JSON.stringify(r.body));return{tenant:r.body.tenant.id,branch:r.body.branch.id,user:r.body.user.id,cookie:r.cookie,email:name+"@test.example"};};
 const resource=async(owner,module,body,method="POST")=>call("/api/restaurant/operations/"+module,method,body,owner.cookie,owner.tenant);
 const save=async(owner,module,name,data,status="active")=>{const r=await resource(owner,module,{name,status,data,branchId:owner.branch});assert.equal(r.status,201,JSON.stringify(r.body));return r.body.id;};
 try{
  let ready=false;for(let i=0;i<60;i++){try{await fetch(origin+"/login");ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,500));}}assert.ok(ready);
  const a=await register("operations-owner-a"),b=await register("operations-owner-b"),staff=await register("operations-kitchen");
  assert.equal((await resource(b,"pos",undefined,"GET")).status,403);
  await db.query("INSERT INTO package_plans(id,code,name_ar,name_en,name_fr) VALUES ('operations-enterprise','operations-enterprise','أعمال','Enterprise','Entreprise')");
  const keys=new Set([...Object.values(resourceModules).map(m=>m.feature).filter(Boolean),"orders","pos","kds","customers","multi_branch","analytics","branding.logo","branding.menu_theme","branding.dark_mode","branding.custom_font","branding.white_label"]);
  for(const key of keys){await db.execute("INSERT IGNORE INTO package_features(feature_key,name_ar,name_en,category) VALUES (?,?,?,'test')",[key,key,key]);await db.execute("INSERT INTO package_plan_features(plan_id,feature_key,enabled) VALUES ('operations-enterprise',?,TRUE)",[key]);}
  await db.execute("UPDATE tenant_subscriptions SET plan_id='operations-enterprise' WHERE tenant_id=?",[a.tenant]);
  const categoryA=await save(a,"categories","Drinks",{}),categoryB=await save(b,"categories","Private category",{});
  assert.equal((await resource(a,"menu",{name:"Invalid",status:"active",data:{price:10,categoryId:categoryB}})).status,404);
  assert.equal((await resource(a,"menu",{name:"Invalid branch",status:"active",branchId:b.branch,data:{price:10,categoryId:categoryA}})).status,404);
  const item=await save(a,"menu","Coffee",{price:10,categoryId:categoryA});
  const table=await save(a,"tables","Table 1",{capacity:4},"available");
  const stock=await save(a,"inventory","Coffee beans",{quantity:0,minimum:1,unit:"kg"});
  const supplier=await save(a,"suppliers","Supplier",{email:"supplier@test.example"});
  const purchase=await save(a,"purchases","Receipt",{inventoryId:stock,supplierId:supplier,quantity:3,unitCost:15},"received");
  let inventory=await resource(a,"inventory",undefined,"GET");assert.equal(inventory.body.resources[0].data.quantity,3);
  const repeated=await resource(a,"purchases",{id:purchase,version:1,name:"Receipt",status:"received",branchId:a.branch,data:{inventoryId:stock,quantity:3,unitCost:15}},"PATCH");assert.equal(repeated.status,400);
  inventory=await resource(a,"inventory",undefined,"GET");assert.equal(inventory.body.resources[0].data.quantity,3);
  const coupon=await save(a,"coupons","Save",{code:"SAVE10",discountType:"percent",value:10,usageLimit:1});
  assert.ok(coupon);
  const requestKey=randomUUID(),orderPayload={branchId:a.branch,channel:"dine_in",tableId:table,couponCode:"SAVE10",requestKey,total:0,items:[{id:item,quantity:2,price:0}]};
  const order=await resource(a,"pos",orderPayload);
  assert.equal(order.status,201,JSON.stringify(order.body));assert.equal(order.body.total,18);
  const replay=await resource(a,"pos",orderPayload);assert.equal(replay.status,201);assert.equal(replay.body.id,order.body.id);
  assert.equal((await resource(a,"pos",{branchId:a.branch,channel:"dine_in",couponCode:"SAVE10",items:[{id:item,quantity:1}]})).status,400);
  assert.equal((await call("/api/restaurant/operations/menu","GET",undefined,a.cookie,b.tenant)).status,403);
  assert.equal((await resource(a,"categories",{id:categoryB,version:1},"DELETE")).status,404);
  await save(a,"team","Kitchen employee",{email:staff.email,role:"kitchen"});
  assert.equal((await call("/api/restaurant/operations/menu","GET",undefined,staff.cookie,a.tenant)).status,403);
  assert.equal((await call("/api/restaurant/operations/pos","POST",{branchId:a.branch,channel:"takeaway",items:[{id:item,quantity:1}]},staff.cookie,a.tenant)).status,403);
  const kitchen=await call("/api/restaurant/operations/kds","GET",undefined,staff.cookie,a.tenant);assert.equal(kitchen.status,200);assert.equal(kitchen.body.orders[0].total,null);assert.equal(kitchen.body.orders[0].customer_phone,null);
  assert.equal((await resource(a,"orders",{id:order.body.id,version:1,paymentStatus:"paid"},"PATCH")).status,200);
  assert.equal((await resource(a,"orders",{id:order.body.id,version:2,status:"cancelled"},"PATCH")).body.code,"REFUND_REQUIRED");
  assert.equal((await call("/api/restaurant/operations/kds","PATCH",{id:order.body.id,version:2,status:"preparing"},staff.cookie,a.tenant)).status,200);
  assert.equal((await call("/api/restaurant/operations/kds","PATCH",{id:order.body.id,version:3,paymentStatus:"refunded"},staff.cookie,a.tenant)).status,403);
  assert.equal((await call("/api/restaurant/operations/kds","PATCH",{id:order.body.id,version:3,status:"ready"},staff.cookie,a.tenant)).status,200);
  assert.equal((await resource(a,"orders",{id:order.body.id,version:4,status:"completed"},"PATCH")).status,200);
  const branchList=await call("/api/restaurant/branches","GET",undefined,a.cookie,a.tenant);
  const mainBranch=branchList.body.branches.find(x=>x.id===a.branch);
  assert.equal((await call("/api/restaurant/branches","PATCH",{id:a.branch,version:mainBranch.version,name:"Renamed main"},a.cookie,a.tenant)).status,200);
  assert.equal((await call("/api/restaurant/branches","PATCH",{id:a.branch,version:mainBranch.version,name:"Stale change"},a.cookie,a.tenant)).status,409);
  const itemVersion=(await resource(a,"menu",undefined,"GET")).body.resources.find(r=>r.id===item).version;
  assert.equal((await resource(a,"menu",{id:item,version:itemVersion,name:"Coffee",status:"active",branchId:a.branch,data:{price:20,categoryId:categoryA}},"PATCH")).status,200);
  assert.equal((await resource(a,"menu",{id:item,version:itemVersion,name:"Coffee",status:"active",data:{price:30,categoryId:categoryA}},"PATCH")).status,409);
  const orders=await resource(a,"orders",undefined,"GET");assert.equal(orders.body.orders[0].total,18);assert.equal(orders.body.orders[0].items[0].price,10);
  const summary=await resource(a,"overview",undefined,"GET");assert.equal(summary.body.summary.sales,18);assert.equal(summary.body.summary.orders,1);
  const today=new Date(Date.now()+3*3600000).toISOString().slice(0,10);
  const report=await call("/api/restaurant/operations/reports?from="+today+"&to="+today,"GET",undefined,a.cookie,a.tenant);assert.equal(report.status,200);assert.equal(report.body.daily[0].sales,18);
  const employeeRows=await resource(a,"team",undefined,"GET"),employeeId=employeeRows.body.resources[0].id;
  const remoteTask=await save(a,"remote","Assigned task",{description:"Review menu",employeeId,budget:100},"assigned");
  await save(a,"remoteWorkers","Worker",{employeeId,skills:"Menu review"},"active");
  await save(a,"remoteMessages","Task message",{taskId:remoteTask,message:"Please review the menu."},"posted");
  await save(a,"remoteDeliveries","Delivery",{taskId:remoteTask,notes:"Review complete."},"submitted");
  for(const [module,name,data,status] of [
   ["attendance","Attendance",{employeeId,date:"2026-10-09"},"present"],
   ["reservations","Guest",{partySize:2,scheduledAt:"2026-10-09T18:00:00Z",tableId:table},"confirmed"],
   ["waitlist","Waiting guest",{partySize:2},"waiting"],
   ["remote","Remote task",{description:"Review menu",employeeId,budget:100},"assigned"],
   ["marketing","Campaign",{message:"Test draft only",channel:"email"},"draft"],
   ["settings","Branch settings",{openingTime:"08:00",closingTime:"23:00"},"active"],
   ["storefront","Brand",{primaryColor:"#224466",brandName:"Published brand",menuTheme:"modern",platformBranding:"hidden"},"active"]
  ])await save(a,module,name,data,status);
  const publicMenu=await fetch(origin+"/operations-owner-a/order");assert.equal(publicMenu.status,200);assert.match(await publicMenu.text(),/Published brand/);
  const group=await save(a,"menuGroups","Size",{itemId:item,selectionType:"single",requiredFlag:"yes",minSelect:1,maxSelect:1});
  const option=await save(a,"menuValues","Large",{groupId:group,priceDelta:2});
  assert.equal((await resource(a,"pos",{branchId:a.branch,channel:"takeaway",items:[{id:item,quantity:1}]})).status,400);
  assert.equal((await resource(a,"pos",{branchId:a.branch,channel:"takeaway",items:[{id:item,quantity:1,options:[categoryB]}]})).status,400);
  const customer=await call("/api/customer/register","POST",{email:"operations-customer@test.example",name:"Customer",password,storeSlug:"operations-owner-a"});assert.equal(customer.status,201);
  assert.equal((await call("/api/customer/orders","POST",{storeSlug:"operations-owner-b",branchId:b.branch,channel:"takeaway",items:[{id:item,quantity:1}]},customer.cookie)).status,403);
  const placed=await call("/api/customer/orders","POST",{storeSlug:"operations-owner-a",branchId:a.branch,channel:"takeaway",total:0,items:[{id:item,quantity:1,options:[option]}]},customer.cookie);assert.equal(placed.status,201);assert.equal(placed.body.total,22);
  const [[customerOrder]]=await db.execute("SELECT customer_user_id FROM restaurant_orders WHERE id=?",[placed.body.id]);assert.equal(customerOrder.customer_user_id,customer.body.user.id);
  const [[savedOptions]]=await db.execute("SELECT options_snapshot FROM restaurant_order_items WHERE order_id=?",[placed.body.id]);assert.match(JSON.stringify(savedOptions.options_snapshot),/Large/);
  const sessions=await resource(a,"security",undefined,"GET");assert.equal(sessions.status,200);
  const current=sessions.body.sessions.find(s=>s.current);assert.ok(current);
  assert.equal((await resource(a,"security",{id:current.id},"DELETE")).status,400);
  const foreignSessions=await resource(b,"security",undefined,"GET");assert.equal((await resource(a,"security",{id:foreignSessions.body.sessions[0].id},"DELETE")).status,404);
  assert.equal((await resource(a,"health",undefined,"GET")).body.database,"connected");
  const admin=await register("operations-platform-admin");
  await db.execute("INSERT INTO platform_admins(user_id,role,enabled) VALUES (?,'super_admin',TRUE)",[admin.user]);
  assert.equal((await call("/api/restaurant/operations/menu","GET",undefined,admin.cookie,b.tenant)).status,200);
  await db.execute("UPDATE auth_sessions SET last_seen_at=DATE_SUB(NOW(),INTERVAL 6 MINUTE) WHERE user_id=?",[admin.user]);
  assert.equal((await call("/api/restaurant/operations/menu","GET",undefined,admin.cookie,b.tenant)).status,403);
 }finally{server.kill();await db.end();}
});
