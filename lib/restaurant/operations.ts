import {checkoutSettings} from "./checkout-settings";
import {printerDispatchAllowed,routePreparationItems} from "./print-policy.mjs";
import {orderChannelStatus,type OrderChannel} from "./order-channel-policy";
import {reservationTransitionAllowed,reservationNoShowDue} from "./reservation-policy";
import {checkoutTotals} from "./checkout-pricing";
import {notifyOrder} from "@/lib/notifications/customer";
import {randomUUID,createHash} from "node:crypto";
import type {PoolConnection,RowDataPacket} from "mysql2/promise";
import {resourceModules,validateResource,ResourceError} from "@/scripts/restaurant-resource-schema.mjs";
import {serviceOrderTransitionAllowed,serviceOrderArchiveAllowed} from "./service-order-policy";
import {diningTable,prepareDiningResource} from "./dining";
import {canonicalMenuModules,canonicalMenuRows,saveCanonicalMenu,menuOptions} from "./menu";
import {catalogQuantityPolicy,validCatalogQuantity} from "@/lib/platform/catalog-measurements";
import {debitCatalogVariant,salesProfile,activityPosOptions,activitySaleItem,debitActivityStock,ensureActivitySaleReference,restoreActivityStock,type StockDebit} from "./activity-pos";

export type StoredResource={currency?:string;id:string;branch_id:string|null;name:string;status:string;data:Record<string,string|number|null>;version:number|string;created_at:string};
export const parseData=(value:unknown):Record<string,string|number|null>=>typeof value==="string"?JSON.parse(value):value as Record<string,string|number|null>;
async function queueOrderPrintJobs(db:PoolConnection,tenantId:string,orderId:string,triggerEvent:"on_accept"|"on_prepare"|"on_paid"){
 const [[order]]=await db.execute<RowDataPacket[]>("SELECT id,branch_id,order_number,channel,table_id,customer_name,customer_phone,kitchen_notes,order_notes,total,currency FROM restaurant_orders WHERE tenant_id=? AND id=? LIMIT 1",[tenantId,orderId]);if(!order)return 0;
 const [[items],[printers],[assignments]]=await Promise.all([
  db.execute<RowDataPacket[]>("SELECT menu_item_id,item_name,quantity,unit_price,line_total,options_snapshot FROM restaurant_order_items WHERE tenant_id=? AND order_id=? ORDER BY id",[tenantId,orderId]),
  db.execute<RowDataPacket[]>("SELECT id,name,data FROM restaurant_resources WHERE tenant_id=? AND (branch_id=? OR branch_id IS NULL) AND kind='printer' AND status='active' AND archived=FALSE",[tenantId,String(order.branch_id)]),
  db.execute<RowDataPacket[]>("SELECT data FROM restaurant_resources WHERE tenant_id=? AND kind='department_assignment' AND status='active' AND archived=FALSE AND (branch_id=? OR branch_id IS NULL)",[tenantId,String(order.branch_id)])
 ]);
 const routes=assignments.map(row=>parseData(row.data));let queued=0;
 for(const printer of printers){
  const config=parseData(printer.data),departmentId=String(config.departmentId??""),purpose=String(config.purpose??"preparation");
  if(!printerDispatchAllowed({triggerEvent},config))continue;
  const routed=triggerEvent==="on_paid"?items:routePreparationItems(items,routes,departmentId);if(!routed.length)continue;
  const includePrices=config.includePrices==="yes"||triggerEvent==="on_paid",includeCustomer=config.includeCustomer==="yes",includeNotes=config.includeNotes==="yes";
  const payload={version:1,orderId:String(order.id),orderNumber:Number(order.order_number),branchId:String(order.branch_id),channel:String(order.channel),tableId:order.table_id?String(order.table_id):null,triggerEvent,printer:{name:String(printer.name),paperWidth:Number(config.paperWidth??80),copies:Number(config.copies??1),purpose,cutPaper:config.cutPaper==="yes",openDrawer:triggerEvent==="on_paid"&&config.openDrawer==="yes",headerText:String(config.headerText??""),footerText:String(config.footerText??"")},...(includeCustomer?{customer:{name:order.customer_name??null,phone:order.customer_phone??null}}:{}),...(includeNotes?{notes:{kitchen:order.kitchen_notes??null,order:order.order_notes??null}}:{}),...(includePrices?{total:Number(order.total),currency:String(order.currency)}:{}),items:routed.map(item=>{const route=routes.find(value=>String(value.itemId??"")===String(item.menu_item_id)&&(!departmentId||String(value.departmentId??"")===departmentId));let options:unknown=item.options_snapshot;try{if(typeof options==="string")options=JSON.parse(options);}catch{options=null;}return{name:String(item.item_name),quantity:Number(item.quantity),...(includePrices?{unitPrice:Number(item.unit_price),lineTotal:Number(item.line_total)}:{}),copies:Math.max(1,Math.min(10,Number(route?.printCopies??1))),options};})};
  await db.execute("INSERT IGNORE INTO restaurant_print_jobs(id,tenant_id,branch_id,printer_id,source_type,source_id,event_key,payload_json,status) VALUES (?,?,?,?,'order',?,?,?,'pending')",[randomUUID(),tenantId,String(order.branch_id),String(printer.id),orderId,orderId+":"+triggerEvent,JSON.stringify(payload)]);queued++;
 }
 return queued;
}
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
 if(module==="reservations"&&previous&&(archive||["cancelled","no_show"].includes(String(body.status)))){
  const [linkedOrders]=await db.execute<RowDataPacket[]>("SELECT id,status FROM restaurant_orders WHERE tenant_id=? AND reservation_id=? LIMIT 1 FOR UPDATE",[tenantId,id]);
  if(linkedOrders.length&&(archive||linkedOrders.some(order=>String(order.status)!=="cancelled")))throw new ResourceError("RESERVATION_HAS_PREORDER");
 }
 if(archive){
  if(module==="serviceOrders"){
   if(!serviceOrderArchiveAllowed(String(previous!.status)))throw new ResourceError("SERVICE_ORDER_ARCHIVE_FORBIDDEN");
   if(parseData(previous!.data).quotationId)throw new ResourceError("SERVICE_ORDER_LINKED_ARCHIVE_FORBIDDEN");
   const [invoices]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND kind='customer_invoice' AND archived=FALSE AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.serviceOrderId'))=? LIMIT 1 FOR UPDATE",[tenantId,id]);
   if(invoices.length)throw new ResourceError("SERVICE_ORDER_ALREADY_INVOICED");
  }
  if(module==="quotations"&&previous?.status!=="draft")throw new ResourceError("QUOTATION_ARCHIVE_FORBIDDEN");
  if(module==="customerInvoices"&&previous?.status!=="draft")throw new ResourceError("INVOICE_ARCHIVE_FORBIDDEN");
  if(["sections","tables"].includes(module)){const field=module==="sections"?"sectionId":"tableId";const [[used]]=await db.execute("SELECT COUNT(*) AS n FROM restaurant_resources WHERE tenant_id=? AND archived=FALSE AND id<>? AND JSON_UNQUOTE(JSON_EXTRACT(data,?))=? AND (kind='dining_table' OR status IN ('pending','confirmed','seated','in_progress'))",[tenantId,id,"$."+field,id]) as [RowDataPacket[],unknown];if(Number(used.n))throw new ResourceError("SECTION_IN_USE");}
  if(module==="team"){const data=parseData(previous!.data);if(data.userId===actor||role!=="owner"&&data.role==="manager")throw new ResourceError("FORBIDDEN");if(data.userId)await db.execute("UPDATE memberships SET status='suspended' WHERE tenant_id=? AND user_id=? AND role<>'owner'",[tenantId,data.userId]);}
  await db.execute("UPDATE restaurant_resources SET archived=TRUE,lookup_key=NULL,version=version+1 WHERE id=? AND tenant_id=?",[id,tenantId]);
  await audit(db,tenantId,actor,module+".archive",id);return {id};
 }
 if(module==="quotations"&&previous){
  const from=String(previous.status),to=String(body.status??"");
  const transitions:Record<string,string[]>={draft:["draft","sent","cancelled"],sent:["sent","accepted","rejected","cancelled"],accepted:[],rejected:[],cancelled:[]};
  if(!transitions[from]?.includes(to))throw new ResourceError("INVALID_QUOTATION_TRANSITION");
  if(from==="sent"&&to==="accepted"){const validUntil=String(parseData(previous.data).validUntil??"");if(validUntil&&Date.parse(validUntil+"T23:59:59.999Z")<Date.now())throw new ResourceError("QUOTATION_EXPIRED");}
  if(from==="sent"&&JSON.stringify(parseData(previous.data))!==JSON.stringify(body.data??{}))throw new ResourceError("QUOTATION_SENT_IMMUTABLE");
  if(from==="sent"&&(String(previous.name)!==String(body.name??"")||String(previous.branch_id??"")!==String(body.branchId??"")))throw new ResourceError("QUOTATION_SENT_IMMUTABLE");
 }
 if(module==="quotations"&&!previous&&!["draft","sent"].includes(String(body.status)))throw new ResourceError("INVALID_QUOTATION_TRANSITION");
 const input=validateResource(module,body);
 if(module==="reservations"){
  const oldStatus=previous?String(previous.status):null;
  if(!reservationTransitionAllowed(oldStatus,String(input.status)))throw new ResourceError("INVALID_RESERVATION_TRANSITION");
  if(input.status==="no_show"){
   if(!previous)throw new ResourceError("INVALID_RESERVATION_TRANSITION");
   const original=parseData(previous.data);
   const [settings]=await db.execute<RowDataPacket[]>("SELECT data FROM restaurant_resources WHERE tenant_id=? AND kind='branch_config' AND archived=FALSE AND (branch_id=? OR branch_id IS NULL) AND JSON_TYPE(JSON_EXTRACT(data,'$.noShowGraceMinutes')) IN ('INTEGER','DOUBLE') ORDER BY (branch_id IS NOT NULL) DESC,updated_at DESC,created_at DESC LIMIT 1",[tenantId,input.branchId??previous.branch_id]);
   const setting=settings[0]?parseData(settings[0].data):{};
   if(!reservationNoShowDue(original.scheduledAt,setting.noShowGraceMinutes))throw new ResourceError("RESERVATION_NO_SHOW_NOT_DUE");
   const reservationFields=resourceModules.reservations.fields.map(field=>field.key);
   if(reservationFields.some(key=>JSON.stringify(original[key]??null)!==JSON.stringify(input.data[key]??null))||String(previous.name)!==String(input.name)||String(previous.branch_id??"")!==String(input.branchId??""))throw new ResourceError("RESERVATION_NO_SHOW_DATA_IMMUTABLE");
  }
 }
 if(module==="quotations"&&input.status==="sent"&&input.data.validUntil){const deadline=Date.parse(String(input.data.validUntil)+"T23:59:59.999Z");if(!Number.isFinite(deadline)||deadline<Date.now())throw new ResourceError("QUOTATION_EXPIRED");}
 if(module==="serviceOrders"){
  const inputOrder=validateResource(module,body);
  if(!serviceOrderTransitionAllowed(previous?String(previous.status):null,String(inputOrder.status)))throw new ResourceError("INVALID_SERVICE_ORDER_TRANSITION");
  if(previous){
   const old=parseData(previous.data);
   if(old.quotationId!==inputOrder.data.quotationId)throw new ResourceError("SERVICE_ORDER_QUOTATION_IMMUTABLE");
   if(["completed","cancelled"].includes(String(previous.status))&&(JSON.stringify(old)!==JSON.stringify(inputOrder.data)||String(previous.name)!==String(inputOrder.name)||String(previous.branch_id??"")!==String(inputOrder.branchId??"")))throw new ResourceError("SERVICE_ORDER_FINAL_IMMUTABLE");
  }
  if(inputOrder.data.quotationId){
   const [quotes]=await db.execute<RowDataPacket[]>("SELECT status,data,branch_id FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='service_quotation' AND archived=FALSE FOR UPDATE",[inputOrder.data.quotationId,tenantId]);
   if(!quotes.length||quotes[0].status!=="accepted"||quotes[0].branch_id&&quotes[0].branch_id!==inputOrder.branchId)throw new ResourceError("SERVICE_ORDER_QUOTATION_NOT_ACCEPTED");
   const quote=parseData(quotes[0].data);
   if(Math.round(Number(quote.amount)*100)!==Math.round(Number(inputOrder.data.amount)*100)||String(quote.customerName)!==String(inputOrder.data.customerName)||String(quote.serviceDescription)!==String(inputOrder.data.serviceDescription))throw new ResourceError("SERVICE_ORDER_QUOTATION_MISMATCH");
   const [linked]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND kind='service_order' AND archived=FALSE AND id<>? AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.quotationId'))=? LIMIT 1 FOR UPDATE",[tenantId,id,inputOrder.data.quotationId]);
   if(linked.length)throw new ResourceError("SERVICE_ORDER_ALREADY_CREATED");
  }
 }
 if(module==="customerInvoices"&&previous){
  const from=String(previous.status),to=String(input.status);
  const transitions:Record<string,string[]>={draft:["draft","issued","void"],issued:["issued","paid","void"],paid:["paid"],void:["void"]};
  if(!transitions[from]?.includes(to))throw new ResourceError("INVALID_INVOICE_TRANSITION");
  if(from!=="paid"&&to==="paid")throw new ResourceError("INVOICE_SETTLEMENT_REQUIRED");
 }
 if(module==="customerInvoices"&&!previous&&!["draft","issued"].includes(String(input.status)))throw new ResourceError("INVALID_INVOICE_TRANSITION");
 if(module==="customerInvoices"&&previous&&["issued","paid","void"].includes(String(previous.status))){
  if(JSON.stringify(parseData(previous.data))!==JSON.stringify(input.data)||String(previous.branch_id??"")!==String(input.branchId??"")||String(previous.name)!==String(input.name))throw new ResourceError("ISSUED_INVOICE_IMMUTABLE");
 }
 if(module==="customerInvoices"&&previous&&parseData(previous.data).quotationId!==input.data.quotationId)throw new ResourceError("INVOICE_QUOTATION_LINK_IMMUTABLE");
 if(module==="customerInvoices"&&previous&&parseData(previous.data).orderId!==input.data.orderId)throw new ResourceError("INVOICE_ORDER_LINK_IMMUTABLE");

 if(module==="customerInvoices"&&previous&&parseData(previous.data).serviceOrderId!==input.data.serviceOrderId)throw new ResourceError("INVOICE_SERVICE_ORDER_LINK_IMMUTABLE");
 if(module==="customerInvoices"&&input.data.serviceOrderId){
  if(input.data.orderId)throw new ResourceError("INVOICE_MULTIPLE_ORDER_SOURCES");
  const [services]=await db.execute<RowDataPacket[]>("SELECT status,data,branch_id FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='service_order' AND archived=FALSE FOR UPDATE",[input.data.serviceOrderId,tenantId]);
  if(!services.length||services[0].status==="cancelled")throw new ResourceError("SERVICE_ORDER_NOT_BILLABLE");
  if(input.branchId&&services[0].branch_id&&input.branchId!==services[0].branch_id)throw new ResourceError("INVOICE_SOURCE_BRANCH_MISMATCH");
  const service=parseData(services[0].data);
  if(input.data.quotationId&&service.quotationId!==input.data.quotationId)throw new ResourceError("INVOICE_SOURCE_QUOTATION_MISMATCH");
  const total=Math.round((Number(input.data.subtotal??0)+Number(input.data.taxAmount??0)+Number(input.data.serviceFee??0))*100);
  if(!Number.isSafeInteger(total)||total!==Math.round(Number(service.amount)*100))throw new ResourceError("SERVICE_ORDER_INVOICE_AMOUNT_MISMATCH");
  const [linked]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND kind='customer_invoice' AND archived=FALSE AND id<>? AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.serviceOrderId'))=? LIMIT 1 FOR UPDATE",[tenantId,id,input.data.serviceOrderId]);
  if(linked.length)throw new ResourceError("SERVICE_ORDER_ALREADY_INVOICED");
 }

 // A converted quotation may retain both references: each is independently
 // validated against the same invoice total, without adding the amounts together.
 if(module==="customerInvoices"&&input.data.quotationId){
  const [quotes]=await db.execute<RowDataPacket[]>("SELECT status,data,branch_id FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='service_quotation' AND archived=FALSE FOR UPDATE",[input.data.quotationId,tenantId]);
  if(!quotes.length||quotes[0].status!=="accepted")throw new ResourceError("QUOTATION_NOT_ACCEPTED");
  if(input.branchId&&quotes[0].branch_id&&input.branchId!==quotes[0].branch_id)throw new ResourceError("REFERENCE_NOT_FOUND");
  if(input.data.orderId){
   const [linkedOrders]=await db.execute<RowDataPacket[]>("SELECT branch_id,customer_phone FROM restaurant_orders WHERE id=? AND tenant_id=? LIMIT 1 FOR UPDATE",[input.data.orderId,tenantId]);
   if(!linkedOrders.length)throw new ResourceError("REFERENCE_NOT_FOUND");
   if(quotes[0].branch_id&&linkedOrders[0].branch_id&&quotes[0].branch_id!==linkedOrders[0].branch_id)throw new ResourceError("INVOICE_SOURCE_BRANCH_MISMATCH");
   const quotedPhone=String(parseData(quotes[0].data).customerPhone??"").replace(/[^0-9]/g,"");
   const orderedPhone=String(linkedOrders[0].customer_phone??"").replace(/[^0-9]/g,"");
   if(quotedPhone&&orderedPhone&&quotedPhone!==orderedPhone)throw new ResourceError("INVOICE_SOURCE_CUSTOMER_MISMATCH");
  }
  const quotedAmount=Math.round(Number(parseData(quotes[0].data).amount)*100);
  const invoiceAmount=Math.round((Number(input.data.subtotal??0)+Number(input.data.taxAmount??0)+Number(input.data.serviceFee??0))*100);
  if(!Number.isSafeInteger(quotedAmount)||quotedAmount!==invoiceAmount)throw new ResourceError("QUOTATION_INVOICE_AMOUNT_MISMATCH");
  const [linked]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND kind='customer_invoice' AND archived=FALSE AND id<>? AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.quotationId'))=? LIMIT 1 FOR UPDATE",[tenantId,id,input.data.quotationId]);
  if(linked.length)throw new ResourceError("QUOTATION_ALREADY_INVOICED");
 }
 if(module==="storefront"&&input.data.menuTheme){await db.execute("INSERT INTO restaurant_menu_appearance(tenant_id,template_key) VALUES (?,?) ON DUPLICATE KEY UPDATE template_key=VALUES(template_key)",[tenantId,input.data.menuTheme]);}
 if(config.singleton)input.branchId=null;
 await branchExists(db,tenantId,input.branchId);
 for(const field of config.fields.filter(f=>f.type==="ref")){
  const value=input.data[field.key];if(!value)continue;
  if(field.ref==="orders"){
   const [orders]=await db.execute<RowDataPacket[]>("SELECT id,branch_id,total,status FROM restaurant_orders WHERE id=? AND tenant_id=? LIMIT 1 FOR UPDATE",[value,tenantId]);
   if(!orders.length||input.branchId&&orders[0].branch_id&&orders[0].branch_id!==input.branchId)throw new ResourceError("REFERENCE_NOT_FOUND");
   if(module==="customerInvoices"){
    if(orders[0].status==="cancelled")throw new ResourceError("INVOICE_ORDER_CANCELLED");
    const total=Math.round(Number(orders[0].total)*100);
    const invoiceTotal=Math.round((Number(input.data.subtotal??0)+Number(input.data.taxAmount??0)+Number(input.data.serviceFee??0))*100);
    if(!Number.isSafeInteger(total)||total!==invoiceTotal)throw new ResourceError("ORDER_INVOICE_AMOUNT_MISMATCH");
    const [linkedInvoices]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND kind='customer_invoice' AND archived=FALSE AND id<>? AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.orderId'))=? LIMIT 1 FOR UPDATE",[tenantId,id,value]);
    if(linkedInvoices.length)throw new ResourceError("ORDER_ALREADY_INVOICED");
   }
   continue;
  }
  const [rows]=await db.execute<RowDataPacket[]>("SELECT id,branch_id FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind=? AND archived=FALSE LIMIT 1 LOCK IN SHARE MODE",[value,tenantId,resourceModules[field.ref!].kind]);
  if(!rows.length||input.branchId&&rows[0].branch_id&&rows[0].branch_id!==input.branchId)throw new ResourceError("REFERENCE_NOT_FOUND");
 }
 if(module==="tables"&&input.status==="available"&&previous?.status!=="available"){
  const [active]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_orders WHERE tenant_id=? AND table_id=? AND (status IS NULL OR status NOT IN ('completed','cancelled','delivered','refunded','rejected')) LIMIT 1",[tenantId,id]);
  if(active.length)throw new ResourceError("TABLE_HAS_UNFINISHED_ORDER");
  const [reservations]=await db.execute<RowDataPacket[]>("SELECT id,data FROM restaurant_resources WHERE tenant_id=? AND kind='reservation' AND archived=FALSE AND status IN ('pending','confirmed','seated') AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.tableId'))=?",[tenantId,id]);
  if(reservations.some(row=>{const data=parseData(row.data);const start=Date.parse(String(data.scheduledAt??""));const duration=Number(data.durationMinutes??90);return Number.isFinite(start)&&start<=Date.now()&&Date.now()<start+duration*60000;}))throw new ResourceError("TABLE_HAS_ACTIVE_RESERVATION");
 }
 const diningLookup=await prepareDiningResource(db,tenantId,module,input,id);
 let lookup:string|null=diningLookup??(config.singleton?"config":module==="coupons"?String(input.data.code):null);
 if(module==="hotelRooms"){
  const roomNumber=String(input.data.roomNumber),roomKey=String(input.branchId)+":"+roomNumber;
  const [duplicates]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND branch_id=? AND kind='hotel_room' AND lookup_key=? AND archived=FALSE AND id<>? LIMIT 1 FOR UPDATE",[tenantId,input.branchId,roomKey,id]);
  if(duplicates.length)throw new ResourceError("DUPLICATE_HOTEL_ROOM");
  lookup=roomKey;
 }
 if(previous&&["waiterCalls","reservations"].includes(module)){const old=parseData(previous.data);for(const key of ["requestFingerprint","customerUserId"])if(old[key])input.data[key]=old[key];lookup=previous.lookup_key??null;}
 if(module==="team"){
  const email=String(input.data.email).toLowerCase(),memberRole=String(input.data.role),membershipRole=memberRole==="supervisor"?"waiter":memberRole;
  if(role!=="owner"&&memberRole==="manager")throw new ResourceError("FORBIDDEN");
  const [users]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE email=? AND status='active' LIMIT 1 LOCK IN SHARE MODE",[email]);
  const userId=users.length?String(users[0].id):null;
  const [members]=userId?await db.execute<RowDataPacket[]>("SELECT role FROM memberships WHERE tenant_id=? AND user_id=? FOR UPDATE",[tenantId,userId]):[[] as RowDataPacket[]];
  if(userId===actor)throw new ResourceError("EMPLOYEE_SELF_ASSIGNMENT_NOT_ALLOWED");
  if(members.some(m=>m.role==="owner"))throw new ResourceError("EMPLOYEE_OWNER_ROLE_PROTECTED");
  if(role!=="owner"&&members.some(m=>m.role==="manager"))throw new ResourceError("EMPLOYEE_MANAGER_ROLE_PROTECTED");
  if(previous&&String(parseData(previous.data).email??"").toLowerCase()!==email)throw new ResourceError("EMPLOYEE_ACCOUNT_IMMUTABLE");
  if(previous&&parseData(previous.data).userId&&parseData(previous.data).userId!==userId)throw new ResourceError("EMPLOYEE_ACCOUNT_IMMUTABLE");
  if(userId){await db.execute("INSERT INTO memberships(id,tenant_id,user_id,role,status) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role),status=VALUES(status)",[randomUUID(),tenantId,userId,membershipRole,input.status]);input.data.userId=userId;}
  else {input.data.invitationStatus="pending";input.status="suspended";}
  if(userId)input.data.invitationStatus="linked";
  input.data.email=email;lookup=email;
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

/** Atomically convert the server-stored, accepted quotation into a service order.
 * Lock the quotation first: concurrent conversions serialize on this same row.
 * Never trust prices, customer data or the quotation status supplied by a browser.
 */
export async function convertAcceptedQuotation(db:PoolConnection,tenantId:string,actor:string,role:string,quotationId:string,requestedBranch:string|null){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(quotationId))throw new ResourceError("INVALID_INPUT");
 const [quotes]=await db.execute<RowDataPacket[]>("SELECT id,name,status,data,branch_id FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='service_quotation' AND archived=FALSE FOR UPDATE",[quotationId,tenantId]);
 if(!quotes.length)throw new ResourceError("REFERENCE_NOT_FOUND");
 const quote=quotes[0];
 if(quote.status!=="accepted")throw new ResourceError("QUOTATION_NOT_ACCEPTED");
 const quoteBranch=quote.branch_id?String(quote.branch_id):null;
 if(quoteBranch&&requestedBranch&&quoteBranch!==requestedBranch)throw new ResourceError("REFERENCE_NOT_FOUND");
 const branchId=quoteBranch??requestedBranch;
 await branchExists(db,tenantId,branchId);
 // Include archived rows in the duplicate guard: archival must never permit re-conversion.
 const [linked]=await db.execute<RowDataPacket[]>("SELECT id,archived,branch_id FROM restaurant_resources WHERE tenant_id=? AND kind='service_order' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.quotationId'))=? LIMIT 2 FOR UPDATE",[tenantId,quotationId]);
 if(linked.length){
  if(linked.length!==1||Number(linked[0].archived))throw new ResourceError("SERVICE_ORDER_ALREADY_CREATED");
  if(branchId&&linked[0].branch_id&&String(linked[0].branch_id)!==branchId)throw new ResourceError("REFERENCE_NOT_FOUND");
  return {id:String(linked[0].id),existing:true};
 }
 const data=parseData(quote.data),amount=Number(data.amount);
 if(!Number.isFinite(amount)||amount<0||amount>100000000)throw new ResourceError("INVALID_QUOTATION_AMOUNT");
 const saved=await saveResource(db,tenantId,actor,role,"serviceOrders",{
  name:String(quote.name),status:"new",branchId,
  data:{quotationId,customerName:String(data.customerName??""),customerPhone:String(data.customerPhone??""),serviceDescription:String(data.serviceDescription??""),amount,notes:String(data.notes??"")}
 });
 await audit(db,tenantId,actor,"quotation.convert",saved.id,{quotationId});
 return {...saved,existing:false};
}

/** Produce an unissued invoice draft from a completed service order.
 * The client supplies only the source ID and optional authorized branch;
 * amounts and customer source are read under row lock on the server.
 */
export async function draftInvoiceForCompletedService(db:PoolConnection,tenantId:string,actor:string,role:string,serviceOrderId:string,requestedBranch:string|null){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(serviceOrderId))throw new ResourceError("INVALID_INPUT");
 const [orders]=await db.execute<RowDataPacket[]>("SELECT id,name,status,data,branch_id FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='service_order' AND archived=FALSE FOR UPDATE",[serviceOrderId,tenantId]);
 if(!orders.length)throw new ResourceError("REFERENCE_NOT_FOUND");
 const order=orders[0],sourceBranch=order.branch_id?String(order.branch_id):null;
 if(sourceBranch&&requestedBranch&&sourceBranch!==requestedBranch)throw new ResourceError("REFERENCE_NOT_FOUND");
 const branchId=sourceBranch??requestedBranch;
 await branchExists(db,tenantId,branchId);
 if(order.status!=="completed")throw new ResourceError("SERVICE_ORDER_NOT_COMPLETED");
 const [invoices]=await db.execute<RowDataPacket[]>("SELECT id,archived,branch_id FROM restaurant_resources WHERE tenant_id=? AND kind='customer_invoice' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.serviceOrderId'))=? LIMIT 2 FOR UPDATE",[tenantId,serviceOrderId]);
 if(invoices.length){
  if(invoices.length!==1||Number(invoices[0].archived))throw new ResourceError("SERVICE_ORDER_ALREADY_INVOICED");
  if(branchId&&invoices[0].branch_id&&String(invoices[0].branch_id)!==branchId)throw new ResourceError("REFERENCE_NOT_FOUND");
  return {id:String(invoices[0].id),existing:true};
 }
 const details=parseData(order.data),amount=Number(details.amount);
 if(!Number.isFinite(amount)||amount<0||amount>100000000)throw new ResourceError("INVALID_SERVICE_ORDER_AMOUNT");
 const quotationId=typeof details.quotationId==="string"&&details.quotationId?details.quotationId:null;
 const saved=await saveResource(db,tenantId,actor,role,"customerInvoices",{
  name:"فاتورة خدمة: "+String(order.name),status:"draft",branchId,
  data:{serviceOrderId,quotationId,subtotal:amount,taxAmount:0,serviceFee:0}
 });
 await audit(db,tenantId,actor,"service_order.invoice_draft",saved.id,{serviceOrderId,quotationId});
 return {...saved,existing:false};
}

/** Merchant-attested manual receipt. This is NOT a gateway/bank verification.
 * Invoice locks serialize competing receipts; settlement records cannot be mutated
 * through resource APIs and are written in the same transaction as the paid status.
 */
export async function confirmManualInvoiceReceipt(
 db:PoolConnection,tenantId:string,actor:string,invoiceId:string,requestedBranch:string|null,
 method:unknown,reference:unknown,amount:unknown,attested:unknown
){
 if(typeof invoiceId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(invoiceId))throw new ResourceError("INVALID_INPUT");
 if(method!=="cash"&&method!=="bank_transfer")throw new ResourceError("INVALID_SETTLEMENT_METHOD");
 if(typeof reference!=="string"||!new RegExp("^[A-Za-z0-9][A-Za-z0-9_./ -]{5,119}$").test(reference.trim()))throw new ResourceError("INVALID_SETTLEMENT_REFERENCE");
 if(typeof amount!=="number"||!Number.isFinite(amount)||amount<0||amount>100000000||Math.abs(amount*100-Math.round(amount*100))>0.000001)throw new ResourceError("INVALID_SETTLEMENT_AMOUNT");
 if(attested!==true)throw new ResourceError("MANUAL_RECEIPT_CONFIRMATION_REQUIRED");
 const [invoices]=await db.execute<RowDataPacket[]>("SELECT id,name,status,branch_id,data FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='customer_invoice' AND archived=FALSE FOR UPDATE",[invoiceId,tenantId]);
 if(!invoices.length)throw new ResourceError("REFERENCE_NOT_FOUND");
 const invoice=invoices[0],invoiceBranch=invoice.branch_id?String(invoice.branch_id):null;
 if(invoiceBranch&&requestedBranch&&invoiceBranch!==requestedBranch)throw new ResourceError("REFERENCE_NOT_FOUND");
 await branchExists(db,tenantId,invoiceBranch??requestedBranch);
 const detail=parseData(invoice.data);
 const due=Math.round((Number(detail.subtotal??0)+Number(detail.taxAmount??0)+Number(detail.serviceFee??0))*100);
 const paid=Math.round(amount*100);
 if(!Number.isSafeInteger(due)||due<0||due!==paid)throw new ResourceError("INVOICE_SETTLEMENT_AMOUNT_MISMATCH");
 const trimmed=reference.trim();
 const [existing]=await db.execute<RowDataPacket[]>("SELECT id,data FROM restaurant_resources WHERE tenant_id=? AND kind='invoice_settlement' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.invoiceId'))=? LIMIT 2 FOR UPDATE",[tenantId,invoiceId]);
 if(existing.length){
  if(existing.length!==1)throw new ResourceError("INVOICE_ALREADY_SETTLED");
  const prior=parseData(existing[0].data);
  if(invoice.status==="paid"&&prior.method===method&&prior.reference===trimmed&&Math.round(Number(prior.amount)*100)===paid)return {id:invoiceId,settlementId:String(existing[0].id),existing:true};
  throw new ResourceError("INVOICE_ALREADY_SETTLED");
 }
 if(invoice.status!=="issued")throw new ResourceError("INVOICE_NOT_ISSUED");
 const token=createHash("sha256").update(String(method)+":"+trimmed).digest("hex");
 const [reused]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND kind='invoice_settlement' AND lookup_key=? LIMIT 1 FOR UPDATE",[tenantId,token]);
 if(reused.length)throw new ResourceError("SETTLEMENT_REFERENCE_REUSED");
 const settlementId=randomUUID(),now=new Date().toISOString();
 const proof={invoiceId,method,reference:trimmed,amount,confirmedBy:actor,confirmedAt:now,source:"merchant_attested_manual"};
 await db.execute("INSERT INTO restaurant_resources(id,tenant_id,branch_id,kind,name,status,data,lookup_key) VALUES (?,?,?,?,?,?,?,?)",[settlementId,tenantId,invoiceBranch??requestedBranch,"invoice_settlement","Manual settlement: "+String(invoice.name),"confirmed",JSON.stringify(proof),token]);
 await db.execute("UPDATE restaurant_resources SET status='paid',version=version+1 WHERE id=? AND tenant_id=? AND kind='customer_invoice' AND status='issued'",[invoiceId,tenantId]);
 await audit(db,tenantId,actor,"customer_invoice.manual_receipt",invoiceId,{settlementId,method,amount,source:"merchant_attested_manual"});
 return {id:invoiceId,settlementId,existing:false};
}

export async function ordersRows(db:PoolConnection,tenantId:string,role:string,branchId?:string|null,actorUserId?:string){
 const financial=["owner","manager","cashier","accountant"].includes(role);
 const values:string[]=[tenantId];let filter="";
 if(branchId){filter+=" AND branch_id=?";values.push(branchId);}
 if(role==="driver"){
  if(!actorUserId||!branchId)return [];
  const [employees]=await db.execute<RowDataPacket[]>("SELECT e.id FROM restaurant_resources e JOIN memberships m ON m.tenant_id=e.tenant_id AND m.user_id=JSON_UNQUOTE(JSON_EXTRACT(e.data,'$.userId')) AND m.role='driver' AND m.status='active' JOIN employee_branch_assignments a ON a.tenant_id=e.tenant_id AND a.user_id=m.user_id AND a.branch_id=e.branch_id AND a.enabled=TRUE WHERE e.tenant_id=? AND e.branch_id=? AND e.kind='employee' AND e.archived=FALSE AND e.status='active' AND JSON_UNQUOTE(JSON_EXTRACT(e.data,'$.userId'))=? AND JSON_UNQUOTE(JSON_EXTRACT(e.data,'$.role'))='driver' LIMIT 2",[tenantId,branchId,actorUserId]);
  if(employees.length!==1)return [];
  filter+=" AND channel='delivery' AND JSON_UNQUOTE(JSON_EXTRACT(checkout_snapshot,'$.assignedDriverId'))=?";values.push(String(employees[0].id));
 }
 const [orders]=await db.execute<RowDataPacket[]>("SELECT id,order_number,branch_id,table_id,reservation_id,dining_section_id,party_size,dining_snapshot,channel,status,payment_status,subtotal,discount,total,checkout_snapshot,currency,version,customer_name,customer_phone,kitchen_notes,order_notes,created_at FROM restaurant_orders WHERE tenant_id=?"+filter+" ORDER BY created_at DESC LIMIT 200",values);
 if(!orders.length)return [];
 const [items]=await db.execute<RowDataPacket[]>("SELECT order_id,item_name,quantity,unit_price,line_total,options_snapshot FROM restaurant_order_items WHERE tenant_id=? AND order_id IN ("+orders.map(()=>"?").join(",")+")",[tenantId,...orders.map(o=>o.id)]);
 return orders.map(o=>{const checkout=o.checkout_snapshot?parseData(o.checkout_snapshot):null;return{...o,pickup_point:checkout?.pickupPoint??null,hotel_room:checkout?.hotelRoom??null,checkout_snapshot:financial?checkout:null,dining_snapshot:o.dining_snapshot?parseData(o.dining_snapshot):null,subtotal:financial?Number(o.subtotal):null,discount:financial?Number(o.discount):null,total:financial?Number(o.total):null,customer_name:role==="kitchen"?null:o.customer_name,customer_phone:["owner","manager","cashier","driver"].includes(role)?o.customer_phone:null,kitchen_notes:o.kitchen_notes??null,order_notes:role==="kitchen"&&o.channel==="delivery"?null:o.order_notes??null,items:items.filter(i=>i.order_id===o.id).map(i=>({name:String(i.item_name)+(i.options_snapshot?" · "+(typeof i.options_snapshot==="string"?JSON.parse(i.options_snapshot):i.options_snapshot).map((v:{name:string})=>v.name).join("، "):""),quantity:Number(i.quantity),price:financial?Number(i.unit_price):null,line_total:financial?Number(i.line_total):null})),version:Number(o.version)};});
}
export async function createOrder(db:PoolConnection,tenantId:string,actor:string,body:Record<string,unknown>,customerId:string|null=null){
 const branchId=typeof body.branchId==="string"?body.branchId:"",cart=body.items as {id:string;quantity:number;options?:string[]}[];
 if(!branchId||!Array.isArray(cart)||!cart.length||cart.length>80||!["dine_in","takeaway","delivery","room_service"].includes(String(body.channel)))throw new ResourceError("INVALID_INPUT");
 if(!cart.every(item=>item&&typeof item.id==="string"&&validCatalogQuantity(item.quantity)))throw new ResourceError("INVALID_CART");
 if(body.kitchenNotes!=null&&(typeof body.kitchenNotes!=="string"||body.kitchenNotes.length>1000)||body.orderNotes!=null&&(typeof body.orderNotes!=="string"||body.orderNotes.length>1000))throw new ResourceError("INVALID_INPUT");
 if(cart.some(item=>item.id.length>36)||body.customerName!=null&&typeof body.customerName!=="string"||body.customerPhone!=null&&typeof body.customerPhone!=="string"||body.couponCode!=null&&(typeof body.couponCode!=="string"||body.couponCode.length>40))throw new ResourceError("INVALID_INPUT");
 const requestKey=body.requestKey==null?null:String(body.requestKey);
 if(requestKey&&!/^[a-f0-9-]{36}$/i.test(requestKey))throw new ResourceError("INVALID_REQUEST_KEY");
 if(cart.some(item=>item.options!==undefined&&(!Array.isArray(item.options)||item.options.length>100||item.options.some(id=>typeof id!=="string"||id.length>36))))throw new ResourceError("INVALID_OPTIONS");
 const reservationId=body.reservationId==null?null:String(body.reservationId);
 if(reservationId&&!/^[a-f0-9-]{36}$/i.test(reservationId))throw new ResourceError("INVALID_INPUT");
 const roomNumber=body.channel==="room_service"&&typeof body.roomNumber==="string"?body.roomNumber.trim().toLocaleUpperCase("en-US"):"";
 if(body.channel==="room_service"&&(!customerId||!roomNumber||roomNumber.length>24||!/^[\p{L}\p{N}][\p{L}\p{N} -]{0,23}$/u.test(roomNumber))||body.channel!=="room_service"&&body.roomNumber!=null)throw new ResourceError("ROOM_NUMBER_REQUIRED");
 const fingerprint=requestKey?createHash("sha256").update(JSON.stringify({...(body.currency!==undefined?{currency:body.currency}:{}),branchId,channel:body.channel,tableId:body.tableId??null,partySize:body.partySize??null,...(reservationId?{reservationId}:{}),pickupPointId:body.pickupPointId??null,...(roomNumber?{roomNumber}:{}),customerId,customerName:body.customerName??null,customerPhone:body.customerPhone??null,couponCode:body.couponCode??null,kitchenNotes:body.kitchenNotes??null,orderNotes:body.orderNotes??null,items:[...cart].sort((a,b)=>a.id.localeCompare(b.id)).map(item=>({id:item.id,quantity:item.quantity,options:[...(item.options??[])].sort()}))})).digest("hex"):null;
 if(requestKey){
  const [users]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE",[actor]);if(!users.length)throw new ResourceError("FORBIDDEN");
  const [existing]=await db.execute<RowDataPacket[]>("SELECT id,total,currency,request_fingerprint FROM restaurant_orders WHERE tenant_id=? AND created_by=? AND request_key=? FOR UPDATE",[tenantId,actor,requestKey]);
  if(existing.length){if(existing[0].request_fingerprint!==fingerprint)throw new ResourceError("CONFLICT");return{id:String(existing[0].id),total:Number(existing[0].total),currency:String(existing[0].currency)};}
 }
 await branchExists(db,tenantId,branchId);
 let reservationData:Record<string,unknown>|null=null;
 if(reservationId){
  if(body.channel!=="dine_in"||!customerId)throw new ResourceError("RESERVATION_ORDER_INVALID");
  const [reservations]=await db.execute<RowDataPacket[]>("SELECT id,branch_id,status,data FROM restaurant_resources WHERE tenant_id=? AND id=? AND kind='reservation' AND archived=FALSE AND status IN ('pending','confirmed') AND branch_id=? FOR UPDATE",[tenantId,reservationId,branchId]);
  if(!reservations.length)throw new ResourceError("RESERVATION_NOT_AVAILABLE");
  reservationData=parseData(reservations[0].data);
  const scheduledAt=Date.parse(String(reservationData.scheduledAt??""));
  if(String(reservationData.customerUserId??"")!==customerId||!Number.isFinite(scheduledAt)||scheduledAt<=Date.now())throw new ResourceError("RESERVATION_NOT_AVAILABLE");
  const partySize=Number(reservationData.partySize);
  if(!Number.isInteger(partySize)||partySize<1||partySize>100)throw new ResourceError("RESERVATION_NOT_AVAILABLE");
  const [priorOrders]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_orders WHERE tenant_id=? AND reservation_id=? LIMIT 1 FOR UPDATE",[tenantId,reservationId]);
  if(priorOrders.length)throw new ResourceError("RESERVATION_ALREADY_ORDERED");
 }
 // Enforce the same availability rules for POS, public menu, and all activity stores.
 const [orderPolicies]=await db.execute<RowDataPacket[]>(
  "SELECT kind,data FROM restaurant_resources WHERE tenant_id=? AND archived=FALSE AND status='active' AND (kind='storefront_config' OR (kind='branch_config' AND branch_id=?)) ORDER BY created_at DESC",
  [tenantId,branchId]
 );
 const operatingSettings=(kind:string)=>{const row=orderPolicies.find(item=>item.kind===kind);return row?parseData(row.data):{};};
 const availability=orderChannelStatus(operatingSettings("storefront_config"),operatingSettings("branch_config"),String(body.channel) as OrderChannel);
 if(!availability.allowed)throw new ResourceError(availability.reason!);
 let hotelRoomSnapshot:{roomNumber:string}|null=null;
 if(body.channel==="room_service"){
  const [rooms]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND branch_id=? AND kind='hotel_room' AND lookup_key=? AND status='active' AND archived=FALSE LIMIT 1 FOR UPDATE",[tenantId,branchId,branchId+":"+roomNumber]);
  if(!rooms.length)throw new ResourceError("HOTEL_ROOM_UNAVAILABLE");
  hotelRoomSnapshot={roomNumber};
 }
 let pickupPointSnapshot:{id:string;name:string;address:string;instructions:string|null;mapUrl:string|null}|null=null;
 if(body.channel==="takeaway"){
  if(body.pickupPointId!=null&&(typeof body.pickupPointId!=="string"||!/^[-a-f0-9]{36}$/i.test(body.pickupPointId)))throw new ResourceError("PICKUP_POINT_UNAVAILABLE");
  const [pickupPoints]=await db.execute<RowDataPacket[]>("SELECT id,name,data FROM restaurant_resources WHERE tenant_id=? AND branch_id=? AND kind='pickup_point' AND status='active' AND archived=FALSE ORDER BY name,id FOR UPDATE",[tenantId,branchId]);
  if(pickupPoints.length&&customerId&&!body.pickupPointId)throw new ResourceError("PICKUP_POINT_REQUIRED");
  if(body.pickupPointId){const point=pickupPoints.find(row=>String(row.id)===body.pickupPointId);if(!point)throw new ResourceError("PICKUP_POINT_UNAVAILABLE");const data=parseData(point.data);pickupPointSnapshot={id:String(point.id),name:String(point.name),address:String(data.address??""),instructions:data.instructions?String(data.instructions):null,mapUrl:data.mapUrl?String(data.mapUrl):null};}
 }else if(body.pickupPointId!=null)throw new ResourceError("INVALID_INPUT");
 const profile=await salesProfile(db,tenantId);
 if(body.currency!==undefined&&body.currency!==profile.currency)throw new ResourceError("CURRENCY_CHANGED");
 if(!profile.dining&&body.channel==="dine_in")throw new ResourceError("CHANNEL_UNAVAILABLE");
 let assignedDriverId:string|null=null;
 if(body.channel==="delivery"){
  // Availability is server-enforced: a branch must have an active assigned driver.
  const [drivers]=await db.execute<RowDataPacket[]>(
   "SELECT e.id FROM restaurant_resources e JOIN memberships m ON m.tenant_id=e.tenant_id AND m.user_id=JSON_UNQUOTE(JSON_EXTRACT(e.data,'$.userId')) AND m.role='driver' AND m.status='active' JOIN employee_branch_assignments a ON a.tenant_id=e.tenant_id AND a.user_id=m.user_id AND a.branch_id=? AND a.enabled=TRUE WHERE e.tenant_id=? AND e.branch_id=? AND e.kind='employee' AND e.archived=FALSE AND e.status='active' AND JSON_UNQUOTE(JSON_EXTRACT(e.data,'$.role'))='driver' ORDER BY e.id FOR UPDATE",
   [branchId,tenantId,branchId]
  );
  // One active delivery per driver. Locking the eligible driver rows serializes
  // concurrent checkouts so the same available driver cannot be double-booked.
  for(const driver of drivers){
   const [active]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_orders WHERE tenant_id=? AND channel='delivery' AND JSON_UNQUOTE(JSON_EXTRACT(checkout_snapshot,'$.assignedDriverId'))=? AND status NOT IN ('completed','cancelled') LIMIT 1 FOR UPDATE",[tenantId,String(driver.id)]);
   if(!active.length){assignedDriverId=String(driver.id);break;}
  }
  if(!assignedDriverId)throw new ResourceError("DELIVERY_DRIVER_UNAVAILABLE");
 }

 const stockDebits:StockDebit[]=[];
 const choices=profile.catalog?await activityPosOptions(db,tenantId,cart.map(item=>item.id),true):await menuOptions(db,tenantId,cart.map(item=>item.id));
 const lines:{id:string;name:string;quantity:number;price:number;total:number;options:{name:string;price:number}[]}[]=[];let subtotal=0;
 for(const item of [...cart].sort((a,b)=>String(a.id).localeCompare(String(b.id)))){
  if(!item||typeof item.id!=="string"||!validCatalogQuantity(item.quantity))throw new ResourceError("INVALID_CART");
  const [rows]=profile.catalog?[[await activitySaleItem(db,tenantId,branchId,item.id)]]:await db.execute<RowDataPacket[]>("SELECT i.id,i.name,i.price,i.currency,m.branch_id FROM restaurant_menu_items i JOIN restaurant_menu_categories c ON c.id=i.category_id AND c.tenant_id=i.tenant_id AND c.enabled=TRUE LEFT JOIN restaurant_resources m ON m.id=i.id AND m.tenant_id=i.tenant_id WHERE i.id=? AND i.tenant_id=? AND i.enabled=TRUE AND COALESCE(m.archived,FALSE)=FALSE LIMIT 1 LOCK IN SHARE MODE",[item.id,tenantId]);
  if(!rows.length||rows[0].branch_id&&rows[0].branch_id!==branchId)throw new ResourceError("ITEM_UNAVAILABLE");
  if(rows[0].currency!==profile.currency)throw new ResourceError("UNSUPPORTED_CURRENCY");
  if(!Number.isInteger(item.quantity)&&(!profile.catalog||!catalogQuantityPolicy(rows[0].attributes).measured))throw new ResourceError("INVALID_CART");
  const selected=item.options??[],groups=choices[item.id]??[],valid=groups.flatMap(group=>group.values);
  if(new Set(selected).size!==selected.length||selected.some(id=>!valid.some(v=>v.id===id)))throw new ResourceError("INVALID_OPTIONS");
  for(const group of groups){const count=selected.filter(id=>group.values.some(v=>v.id===id)).length;if(count<(group.required?Math.max(1,group.min):group.min)||count>(group.type==="single"?Math.min(1,group.max):group.max))throw new ResourceError("INVALID_OPTIONS");}
  const options=valid.filter(v=>selected.includes(v.id)).map(v=>({name:v.name,price:v.price}));
  const price=Math.round(Number(rows[0].price)*100)+options.reduce((sum,option)=>sum+Math.round(option.price*100),0);
  if(!Number.isFinite(price)||price<0||price>100000000)throw new ResourceError("ITEM_UNAVAILABLE");
  if(profile.catalog){await debitCatalogVariant(db,tenantId,item.id,selected,item.quantity,stockDebits);await debitActivityStock(db,tenantId,"product",item.id,item.quantity,stockDebits);for(const option of selected)await debitActivityStock(db,tenantId,"option",option,item.quantity,stockDebits);await ensureActivitySaleReference(db,tenantId,rows[0]);}
  else await db.execute("INSERT IGNORE INTO restaurant_resources(id,tenant_id,kind,name,status,data) VALUES (?,?,'menu_item',?,'active','{}')",[item.id,tenantId,rows[0].name]);
  const total=Math.round(price*Math.round(item.quantity*1000)/1000);subtotal+=total;lines.push({id:item.id,name:profile.catalog&&catalogQuantityPolicy(rows[0].attributes).measured?String(rows[0].name).slice(0,166)+" / "+catalogQuantityPolicy(rows[0].attributes).unit:String(rows[0].name),quantity:item.quantity,price:price/100,total:total/100,options});
 }
 if(subtotal>999999999999)throw new ResourceError("INVALID_CART");
 const tableId=body.channel==="dine_in"&&!reservationId&&body.tableId?String(body.tableId):null;
 const partySize=reservationData?Number(reservationData.partySize):Number(body.partySize);
 if(body.channel==="dine_in"&&(!tableId&&!reservationData||!Number.isInteger(partySize)||partySize<1))throw new ResourceError("DINING_DETAILS_REQUIRED");
 const dining=tableId?await diningTable(db,tenantId,branchId,tableId,Number(body.partySize)):null;
 if(tableId){
  // Serialize orders for a table to prevent two concurrent checkouts from taking it.
  const [unfinished]=await db.execute<RowDataPacket[]>(
   "SELECT id FROM restaurant_orders WHERE tenant_id=? AND branch_id=? AND table_id=? AND (status IS NULL OR status NOT IN ('completed','cancelled','delivered','refunded','rejected')) LIMIT 1 FOR UPDATE",
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
 const kitchenNotes=body.kitchenNotes==null?null:String(body.kitchenNotes).trim(),orderNotes=body.orderNotes==null?null:String(body.orderNotes).trim();
 if((kitchenNotes?.length??0)>1000||(orderNotes?.length??0)>1000)throw new ResourceError("INVALID_INPUT");
 const settings=await checkoutSettings(db,tenantId);
 const totals=checkoutTotals(subtotal/100,discount/100,String(body.channel),settings.policy);
 const snapshot={version:1,...settings,...totals,...(assignedDriverId?{assignedDriverId}:{}),...(reservationId?{reservationId}:{}),...(pickupPointSnapshot?{pickupPoint:pickupPointSnapshot}:{}),...(hotelRoomSnapshot?{hotelRoom:hotelRoomSnapshot}:{})};
 const id=randomUUID();
 await db.execute("INSERT INTO restaurant_orders(id,tenant_id,branch_id,table_id,reservation_id,dining_section_id,party_size,dining_snapshot,coupon_id,customer_name,customer_phone,customer_user_id,created_by,request_key,request_fingerprint,channel,subtotal,discount,total,kitchen_notes,order_notes,currency,checkout_snapshot) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,tenantId,branchId,tableId,reservationId,dining?.sectionId??null,body.channel==="dine_in"?partySize:null,dining?JSON.stringify(dining):null,couponId,customerName,phone,customerId,actor,requestKey,fingerprint,String(body.channel),subtotal/100,discount/100,totals.total,kitchenNotes,orderNotes,profile.currency,JSON.stringify(snapshot)]);
 if(tableId)await db.execute("UPDATE restaurant_resources SET status='occupied',version=version+1 WHERE id=? AND tenant_id=? AND kind='dining_table' AND status='available'",[tableId,tenantId]);
 for(const line of lines)await db.execute("INSERT INTO restaurant_order_items(id,tenant_id,order_id,menu_item_id,item_name,quantity,unit_price,line_total,options_snapshot) VALUES (?,?,?,?,?,?,?,?,?)",[randomUUID(),tenantId,id,line.id,line.name,line.quantity,line.price,line.total,JSON.stringify(line.options)]);
 await queueOrderPrintJobs(db,tenantId,id,"on_accept");
 await audit(db,tenantId,actor,"order.create",id,{total:totals.total,...(profile.catalog?{stockDebits,currency:profile.currency}:{})});
 await notifyOrder(db,tenantId,id,"new");
 return {id,total:totals.total,currency:profile.currency};
}
export async function updateOrder(db:PoolConnection,tenantId:string,actor:string,role:string,body:Record<string,unknown>){
 if(typeof body.id!=="string")throw new ResourceError("INVALID_INPUT");
 const [rows]=await db.execute<RowDataPacket[]>("SELECT id,status,payment_status,version,channel,table_id,branch_id,checkout_snapshot FROM restaurant_orders WHERE id=? AND tenant_id=? FOR UPDATE",[body.id,tenantId]);const order=rows[0];
 if(!order)throw new ResourceError("ORDER_NOT_FOUND");
 if(!Number.isInteger(body.version)||Number(body.version)!==Number(order.version))throw new ResourceError("CONFLICT");
 if(role==="driver"){
  const snapshot=order.checkout_snapshot?parseData(order.checkout_snapshot):{};
  const [assigned]=await db.execute<RowDataPacket[]>("SELECT e.id FROM restaurant_resources e JOIN memberships m ON m.tenant_id=e.tenant_id AND m.user_id=JSON_UNQUOTE(JSON_EXTRACT(e.data,'$.userId')) AND m.role='driver' AND m.status='active' JOIN employee_branch_assignments a ON a.tenant_id=e.tenant_id AND a.user_id=m.user_id AND a.branch_id=e.branch_id AND a.enabled=TRUE WHERE e.tenant_id=? AND e.branch_id=? AND e.kind='employee' AND e.archived=FALSE AND e.status='active' AND JSON_UNQUOTE(JSON_EXTRACT(e.data,'$.userId'))=? AND JSON_UNQUOTE(JSON_EXTRACT(e.data,'$.role'))='driver' AND e.id=? LIMIT 1 FOR UPDATE",[tenantId,String(order.branch_id),actor,String(snapshot.assignedDriverId??"")]);
  if(order.channel!=="delivery"||!assigned.length)throw new ResourceError("FORBIDDEN");
 }
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
 if(status==="cancelled"&&order.status!=="cancelled")await restoreActivityStock(db,tenantId,String(order.id));
 await db.execute("UPDATE restaurant_orders SET status=?,payment_status=?,version=version+1 WHERE id=? AND tenant_id=?",[status,payment,order.id,tenantId]);
 if(status!==String(order.status)&&status==="preparing")await queueOrderPrintJobs(db,tenantId,String(order.id),"on_prepare");
 if(payment!==String(order.payment_status)&&payment==="paid")await queueOrderPrintJobs(db,tenantId,String(order.id),"on_paid");
 // A completed order does not prove that the guest has left.
 // Keep the table occupied until staff explicitly confirms departure.
 if(status!==String(order.status))await notifyOrder(db,tenantId,String(order.id),status);
 if(payment!==String(order.payment_status))await notifyOrder(db,tenantId,String(order.id),payment,true);
 await audit(db,tenantId,actor,"order.update",String(order.id),{status,paymentStatus:payment});return {id:order.id};
}


