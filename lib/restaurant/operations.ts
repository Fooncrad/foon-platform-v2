import {randomUUID,createHash} from "node:crypto";
import type {PoolConnection,RowDataPacket} from "mysql2/promise";
import {resourceModules,validateResource,ResourceError} from "@/scripts/restaurant-resource-schema.mjs";
import {diningTable,prepareDiningResource} from "./dining";
import {canonicalMenuModules,canonicalMenuRows,saveCanonicalMenu,menuOptions} from "./menu";

export type StoredResource={id:string;branch_id:string|null;name:string;status:string;data:Record<string,string|number|null>;version:number|string;created_at:string};
export const parseData=(value:unknown):Record<string,string|number|null>=>typeof value==="string"?JSON.parse(value):value as Record<string,string|number|null>;
export async function resourceRows(db:PoolConnection,tenantId:string,module:string,branchId?:string|null){
 if(canonicalMenuModules.includes(module))return canonicalMenuRows(db,tenantId,module,branchId);
 const config=resourceModules[module];
 const [rows]=await db.execute<RowDataPacket[]>("SELECT id,branch_id,name,status,data,version,created_at FROM restaurant_resources WHERE tenant_id=? AND kind=? AND archived=FALSE"+(branchId?" AND (branch_id=? OR branch_id IS NULL)":"")+" ORDER BY created_at DESC LIMIT 200",branchId?[tenantId,config.kind,branchId]:[tenantId,config.kind]);
 return rows.map(r=>({...r,data:parseData(r.data),version:Number(r.version)})) as StoredResource[];
}
export async function branchExists(db:PoolConnection,tenantId:string,branchId:string|null,activeOnly=true){
 if(!branchId)return;
 const [rows]=await db.execute<RowDataPacket[]>("SELECT id FROM branches WHERE id=? AND tenant_id=?"+(activeOnly?" AND enabled=TRUE":"")+" LIMIT 1 LOCK IN SHARE MODE",[branchId,tenantId]);
 if(!rows.length)throw new ResourceError("BRANCH_NOT_FOUND");
}
async function audit(db:PoolConnection,tenantId:string,actor:string,action:string,id:string,metadata:Record<string,unknown>={}){
 await db.execute("INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id,metadata) VALUES (?,?,?,?,?)",[tenantId,actor,action,id,JSON.stringify(metadata)]);
}
export async function saveResource(db:PoolConnection,tenantId:string,actor:string,role:string,module:string,body:Record<string,unknown>,archive=false){
 if(canonicalMenuModules.includes(module))return saveCanonicalMenu(db,tenantId,actor,module,body,archive);
 const config=resourceModules[module],id=body.id===undefined?randomUUID():String(body.id);
 let previous:RowDataPacket|undefined;
 if(body.id!==undefined){const [rows]=await db.execute<RowDataPacket[]>("SELECT id,name,status,data,branch_id,version,lookup_key FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind=? AND archived=FALSE FOR UPDATE",[id,tenantId,config.kind]);previous=rows[0];if(!previous)throw new ResourceError("RESOURCE_NOT_FOUND");if(!Number.isInteger(body.version)||Number(body.version)!==Number(previous.version))throw new ResourceError("CONFLICT");}
 if(archive&&!previous)throw new ResourceError("INVALID_INPUT");
 if(archive){
  if(["sections","tables"].includes(module)){const field=module==="sections"?"sectionId":"tableId";const [[used]]=await db.execute("SELECT COUNT(*) AS n FROM restaurant_resources WHERE tenant_id=? AND archived=FALSE AND id<>? AND JSON_UNQUOTE(JSON_EXTRACT(data,?))=? AND (kind='dining_table' OR status IN ('pending','confirmed','seated','in_progress'))",[tenantId,id,"$."+field,id]) as [RowDataPacket[],unknown];if(Number(used.n))throw new ResourceError("SECTION_IN_USE");}
  if(module==="team"){const data=parseData(previous!.data);if(data.userId===actor||role!=="owner"&&data.role==="manager")throw new ResourceError("FORBIDDEN");await db.execute("UPDATE memberships SET status='suspended' WHERE tenant_id=? AND user_id=? AND role<>'owner'",[tenantId,data.userId]);}
  await db.execute("UPDATE restaurant_resources SET archived=TRUE,lookup_key=NULL,version=version+1 WHERE id=? AND tenant_id=?",[id,tenantId]);
  await audit(db,tenantId,actor,module+".archive",id);return {id};
 }
 const input=validateResource(module,body);
 if(module==="storefront"&&input.data.menuTheme){await db.execute("INSERT INTO restaurant_menu_appearance(tenant_id,template_key) VALUES (?,?) ON DUPLICATE KEY UPDATE template_key=VALUES(template_key)",[tenantId,input.data.menuTheme]);}
 if(config.singleton)input.branchId=null;
 await branchExists(db,tenantId,input.branchId);
 for(const field of config.fields.filter(f=>f.type==="ref")){
  const value=input.data[field.key];if(!value)continue;
  const [rows]=await db.execute<RowDataPacket[]>("SELECT id,branch_id FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind=? AND archived=FALSE LIMIT 1 LOCK IN SHARE MODE",[value,tenantId,resourceModules[field.ref!].kind]);
  if(!rows.length||input.branchId&&rows[0].branch_id&&rows[0].branch_id!==input.branchId)throw new ResourceError("REFERENCE_NOT_FOUND");
 }
 const diningLookup=await prepareDiningResource(db,tenantId,module,input,id);
 let lookup:string|null=diningLookup??(config.singleton?"config":module==="coupons"?String(input.data.code):null);
 if(previous&&["waiterCalls","reservations"].includes(module)){const old=parseData(previous.data);for(const key of ["requestFingerprint","customerUserId"])if(old[key])input.data[key]=old[key];lookup=previous.lookup_key??null;}
 if(module==="team"){
  const email=String(input.data.email).toLowerCase(),memberRole=String(input.data.role);
  if(role!=="owner"&&memberRole==="manager")throw new ResourceError("FORBIDDEN");
  const [users]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE email=? AND status='active' LIMIT 1 LOCK IN SHARE MODE",[email]);
  if(!users.length)throw new ResourceError("EMPLOYEE_ACCOUNT_NOT_FOUND");
  const userId=String(users[0].id),[members]=await db.execute<RowDataPacket[]>("SELECT role FROM memberships WHERE tenant_id=? AND user_id=? FOR UPDATE",[tenantId,userId]);
  if(userId===actor||members.some(m=>m.role==="owner")||role!=="owner"&&members.some(m=>m.role==="manager"))throw new ResourceError("FORBIDDEN");
  if(previous&&parseData(previous.data).userId!==userId)throw new ResourceError("EMPLOYEE_ACCOUNT_IMMUTABLE");
  await db.execute("INSERT INTO memberships(id,tenant_id,user_id,role,status) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role),status=VALUES(status)",[randomUUID(),tenantId,userId,memberRole,input.status]);
  input.data.userId=userId;input.data.email=email;lookup=email;
 }
 if(module==="purchases"){
  if(previous?.status==="received")throw new ResourceError("RECEIVED_PURCHASE_IMMUTABLE");
  if(input.status==="received"){
   const [stocks]=await db.execute<RowDataPacket[]>("SELECT id,data FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='inventory_item' AND archived=FALSE FOR UPDATE",[input.data.inventoryId,tenantId]);
   if(!stocks.length)throw new ResourceError("REFERENCE_NOT_FOUND");
   const stock=parseData(stocks[0].data),quantity=Number(stock.quantity)+Number(input.data.quantity);
   if(!Number.isFinite(quantity)||quantity>1000000)throw new ResourceError("INVALID_QUANTITY");
   stock.quantity=Math.round(quantity*1000)/1000;
   await db.execute("UPDATE restaurant_resources SET data=?,version=version+1 WHERE id=? AND tenant_id=?",[JSON.stringify(stock),stocks[0].id,tenantId]);
  }
 }
 if(previous)await db.execute("UPDATE restaurant_resources SET name=?,status=?,branch_id=?,data=?,lookup_key=?,version=version+1 WHERE id=? AND tenant_id=?",[input.name,input.status,input.branchId,JSON.stringify(input.data),lookup,id,tenantId]);
 else await db.execute("INSERT INTO restaurant_resources(id,tenant_id,branch_id,kind,name,status,data,lookup_key) VALUES (?,?,?,?,?,?,?,?)",[id,tenantId,input.branchId,config.kind,input.name,input.status,JSON.stringify(input.data),lookup]);
 await audit(db,tenantId,actor,module+".save",id,{status:input.status});
 return {id};
}

export async function ordersRows(db:PoolConnection,tenantId:string,role:string,branchId?:string|null){
 const financial=["owner","manager","cashier","accountant"].includes(role);
 const values:string[]=[tenantId];let filter="";
 if(branchId){filter+=" AND branch_id=?";values.push(branchId);}
 if(role==="driver")filter+=" AND channel='delivery'";
 const [orders]=await db.execute<RowDataPacket[]>("SELECT id,order_number,branch_id,table_id,dining_section_id,party_size,dining_snapshot,channel,status,payment_status,subtotal,discount,total,currency,version,customer_name,customer_phone,created_at FROM restaurant_orders WHERE tenant_id=?"+filter+" ORDER BY created_at DESC LIMIT 200",values);
 if(!orders.length)return [];
 const [items]=await db.execute<RowDataPacket[]>("SELECT order_id,item_name,quantity,unit_price,line_total,options_snapshot FROM restaurant_order_items WHERE tenant_id=? AND order_id IN ("+orders.map(()=>"?").join(",")+")",[tenantId,...orders.map(o=>o.id)]);
 return orders.map(o=>({...o,dining_snapshot:o.dining_snapshot?parseData(o.dining_snapshot):null,subtotal:financial?Number(o.subtotal):null,discount:financial?Number(o.discount):null,total:financial?Number(o.total):null,customer_name:role==="kitchen"?null:o.customer_name,customer_phone:["owner","manager","cashier","driver"].includes(role)?o.customer_phone:null,items:items.filter(i=>i.order_id===o.id).map(i=>({name:String(i.item_name)+(i.options_snapshot?" · "+(typeof i.options_snapshot==="string"?JSON.parse(i.options_snapshot):i.options_snapshot).map((v:{name:string})=>v.name).join("، "):""),quantity:Number(i.quantity),price:financial?Number(i.unit_price):null})),version:Number(o.version)}));
}
export async function createOrder(db:PoolConnection,tenantId:string,actor:string,body:Record<string,unknown>,customerId:string|null=null){
 const branchId=typeof body.branchId==="string"?body.branchId:"",cart=body.items as {id:string;quantity:number;options?:string[]}[];
 if(!branchId||!Array.isArray(cart)||!cart.length||cart.length>80||!["dine_in","takeaway","delivery"].includes(String(body.channel)))throw new ResourceError("INVALID_INPUT");
 if(!cart.every(item=>item&&typeof item.id==="string"&&Number.isInteger(item.quantity)&&item.quantity>=1&&item.quantity<=1000))throw new ResourceError("INVALID_CART");
 if(cart.some(item=>item.id.length>36)||body.customerName!=null&&typeof body.customerName!=="string"||body.customerPhone!=null&&typeof body.customerPhone!=="string"||body.couponCode!=null&&(typeof body.couponCode!=="string"||body.couponCode.length>40))throw new ResourceError("INVALID_INPUT");
 const requestKey=body.requestKey==null?null:String(body.requestKey);
 if(requestKey&&!/^[a-f0-9-]{36}$/i.test(requestKey))throw new ResourceError("INVALID_REQUEST_KEY");
 if(cart.some(item=>item.options!==undefined&&(!Array.isArray(item.options)||item.options.length>100||item.options.some(id=>typeof id!=="string"||id.length>36))))throw new ResourceError("INVALID_OPTIONS");
 const fingerprint=requestKey?createHash("sha256").update(JSON.stringify({branchId,channel:body.channel,tableId:body.tableId??null,partySize:body.partySize??null,customerId,customerName:body.customerName??null,customerPhone:body.customerPhone??null,couponCode:body.couponCode??null,items:[...cart].sort((a,b)=>a.id.localeCompare(b.id)).map(item=>({id:item.id,quantity:item.quantity,options:[...(item.options??[])].sort()}))})).digest("hex"):null;
 if(requestKey){
  const [users]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE",[actor]);if(!users.length)throw new ResourceError("FORBIDDEN");
  const [existing]=await db.execute<RowDataPacket[]>("SELECT id,total,request_fingerprint FROM restaurant_orders WHERE tenant_id=? AND created_by=? AND request_key=? FOR UPDATE",[tenantId,actor,requestKey]);
  if(existing.length){if(existing[0].request_fingerprint!==fingerprint)throw new ResourceError("CONFLICT");return{id:String(existing[0].id),total:Number(existing[0].total)};}
 }
 await branchExists(db,tenantId,branchId);
 const choices=await menuOptions(db,tenantId,cart.map(item=>item.id));
 const lines:{id:string;name:string;quantity:number;price:number;total:number;options:{name:string;price:number}[]}[]=[];let subtotal=0;
 for(const item of [...cart].sort((a,b)=>String(a.id).localeCompare(String(b.id)))){
  if(!item||typeof item.id!=="string"||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>1000)throw new ResourceError("INVALID_CART");
  const [rows]=await db.execute<RowDataPacket[]>("SELECT i.id,i.name,i.price,i.currency,m.branch_id FROM restaurant_menu_items i JOIN restaurant_menu_categories c ON c.id=i.category_id AND c.tenant_id=i.tenant_id AND c.enabled=TRUE LEFT JOIN restaurant_resources m ON m.id=i.id AND m.tenant_id=i.tenant_id WHERE i.id=? AND i.tenant_id=? AND i.enabled=TRUE AND COALESCE(m.archived,FALSE)=FALSE LIMIT 1 LOCK IN SHARE MODE",[item.id,tenantId]);
  if(!rows.length||rows[0].branch_id&&rows[0].branch_id!==branchId)throw new ResourceError("ITEM_UNAVAILABLE");
  if(rows[0].currency!=="SAR")throw new ResourceError("UNSUPPORTED_CURRENCY");
  const selected=item.options??[],groups=choices[item.id]??[],valid=groups.flatMap(group=>group.values);
  if(new Set(selected).size!==selected.length||selected.some(id=>!valid.some(v=>v.id===id)))throw new ResourceError("INVALID_OPTIONS");
  for(const group of groups){const count=selected.filter(id=>group.values.some(v=>v.id===id)).length;if(count<(group.required?Math.max(1,group.min):group.min)||count>(group.type==="single"?Math.min(1,group.max):group.max))throw new ResourceError("INVALID_OPTIONS");}
  const options=valid.filter(v=>selected.includes(v.id)).map(v=>({name:v.name,price:v.price}));
  const price=Math.round(Number(rows[0].price)*100)+options.reduce((sum,option)=>sum+Math.round(option.price*100),0);
  if(!Number.isFinite(price)||price<0||price>100000000)throw new ResourceError("ITEM_UNAVAILABLE");
  await db.execute("INSERT IGNORE INTO restaurant_resources(id,tenant_id,kind,name,status,data) VALUES (?,?,'menu_item',?,'active','{}')",[item.id,tenantId,rows[0].name]);
  const total=price*item.quantity;subtotal+=total;lines.push({id:item.id,name:String(rows[0].name),quantity:item.quantity,price:price/100,total:total/100,options});
 }
 if(subtotal>999999999999)throw new ResourceError("INVALID_CART");
 const tableId=body.channel==="dine_in"&&body.tableId?String(body.tableId):null;
 if(body.channel==="dine_in"&&(!tableId||!Number.isInteger(body.partySize)||Number(body.partySize)<1))throw new ResourceError("DINING_DETAILS_REQUIRED");
 const dining=tableId?await diningTable(db,tenantId,branchId,tableId,Number(body.partySize)):null;
 if(tableId){const [rows]=await db.execute<RowDataPacket[]>("SELECT id,branch_id FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='dining_table' AND status<>'inactive' AND archived=FALSE LIMIT 1 LOCK IN SHARE MODE",[tableId,tenantId]);if(!rows.length||rows[0].branch_id&&rows[0].branch_id!==branchId)throw new ResourceError("TABLE_NOT_FOUND");}
 if(tableId){
  // Serialize orders for a table to prevent two concurrent checkouts from taking it.
  const [lockedTable]=await db.execute<RowDataPacket[]>(
   "SELECT id FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='dining_table' AND archived=FALSE FOR UPDATE",
   [tableId,tenantId]
  );
  if(!lockedTable.length)throw new ResourceError("TABLE_NOT_FOUND");
  const [unfinished]=await db.execute<RowDataPacket[]>(
   "SELECT id FROM restaurant_orders WHERE tenant_id=? AND branch_id=? AND table_id=? AND status NOT IN ('completed','cancelled') LIMIT 1 FOR UPDATE",
   [tenantId,branchId,tableId]
  );
  if(unfinished.length)throw new ResourceError("TABLE_HAS_UNFINISHED_ORDER");
 }
 let couponId:string|null=null,discount=0;
 if(body.couponCode){
  const [rows]=await db.execute<RowDataPacket[]>("SELECT id,data FROM restaurant_resources WHERE tenant_id=? AND kind='coupon' AND lookup_key=? AND status='active' AND archived=FALSE FOR UPDATE",[tenantId,String(body.couponCode).trim().toUpperCase()]);
  if(!rows.length)throw new ResourceError("COUPON_UNAVAILABLE");const coupon=parseData(rows[0].data);
  if(coupon.endsAt&&Date.parse(String(coupon.endsAt))<=Date.now())throw new ResourceError("COUPON_UNAVAILABLE");
  if(coupon.usageLimit){const [[used]]=await db.execute<RowDataPacket[]>("SELECT COUNT(*) AS n FROM restaurant_orders WHERE tenant_id=? AND coupon_id=? AND status<>'cancelled'",[tenantId,rows[0].id]);if(Number(used.n)>=Number(coupon.usageLimit))throw new ResourceError("COUPON_LIMIT_REACHED");}
  couponId=String(rows[0].id);discount=Math.min(subtotal,coupon.discountType==="percent"?Math.round(subtotal*Number(coupon.value)/100):Math.round(Number(coupon.value)*100));
 }
 const customerName=body.customerName==null?null:String(body.customerName).trim(),phone=body.customerPhone==null?null:String(body.customerPhone).trim();
 if((customerName?.length??0)>180||(phone?.length??0)>40)throw new ResourceError("INVALID_INPUT");
 const id=randomUUID();
 await db.execute("INSERT INTO restaurant_orders(id,tenant_id,branch_id,table_id,dining_section_id,party_size,dining_snapshot,coupon_id,customer_name,customer_phone,customer_user_id,created_by,request_key,request_fingerprint,channel,subtotal,discount,total) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,tenantId,branchId,tableId,dining?.sectionId??null,dining?Number(body.partySize):null,dining?JSON.stringify(dining):null,couponId,customerName,phone,customerId,actor,requestKey,fingerprint,String(body.channel),subtotal/100,discount/100,(subtotal-discount)/100]);
 for(const line of lines)await db.execute("INSERT INTO restaurant_order_items(id,tenant_id,order_id,menu_item_id,item_name,quantity,unit_price,line_total,options_snapshot) VALUES (?,?,?,?,?,?,?,?,?)",[randomUUID(),tenantId,id,line.id,line.name,line.quantity,line.price,line.total,JSON.stringify(line.options)]);
 await audit(db,tenantId,actor,"order.create",id,{total:(subtotal-discount)/100});
 return {id,total:(subtotal-discount)/100};
}
export async function updateOrder(db:PoolConnection,tenantId:string,actor:string,role:string,body:Record<string,unknown>){
 if(typeof body.id!=="string")throw new ResourceError("INVALID_INPUT");
 const [rows]=await db.execute<RowDataPacket[]>("SELECT id,status,payment_status,version,channel FROM restaurant_orders WHERE id=? AND tenant_id=? FOR UPDATE",[body.id,tenantId]);const order=rows[0];
 if(!order)throw new ResourceError("ORDER_NOT_FOUND");
 if(!Number.isInteger(body.version)||Number(body.version)!==Number(order.version))throw new ResourceError("CONFLICT");
 let status=String(order.status),payment=String(order.payment_status);
 if(body.status!==undefined){
  const next=String(body.status),transitions:Record<string,string[]>={new:["preparing","cancelled"],preparing:["ready","cancelled"],ready:["completed","cancelled"],completed:[],cancelled:[]};
  if(!transitions[status].includes(next))throw new ResourceError("INVALID_TRANSITION");
  if(role==="kitchen"&&!(status==="new"&&next==="preparing"||status==="preparing"&&next==="ready")||role==="waiter"&&!(status==="ready"&&next==="completed")||role==="driver"&&!(order.channel==="delivery"&&status==="ready"&&next==="completed")||role==="accountant")throw new ResourceError("FORBIDDEN");
  if(next==="cancelled"&&payment==="paid")throw new ResourceError("REFUND_REQUIRED");status=next;
 }
 if(body.paymentStatus!==undefined){
  if(!["owner","manager","cashier"].includes(role))throw new ResourceError("FORBIDDEN");
  const next=String(body.paymentStatus);
  if(!(payment==="unpaid"&&next==="paid"&&status!=="cancelled"||payment==="paid"&&next==="refunded"))throw new ResourceError("INVALID_PAYMENT_TRANSITION");payment=next;
 }
 if(body.status===undefined&&body.paymentStatus===undefined)throw new ResourceError("INVALID_INPUT");
 await db.execute("UPDATE restaurant_orders SET status=?,payment_status=?,version=version+1 WHERE id=? AND tenant_id=?",[status,payment,order.id,tenantId]);
 await audit(db,tenantId,actor,"order.update",String(order.id),{status,paymentStatus:payment});return {id:order.id};
}
