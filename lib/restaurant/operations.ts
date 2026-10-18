import {checkoutSettings} from "./checkout-settings";
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
  const config=parseData(printer.data),departmentId=String(config.departmentId??"");
  if(config.autoPrint!=="yes"||config.printOn!==triggerEvent)continue;
  const purpose=String(config.purpose??"preparation");if(triggerEvent==="on_paid"?!["customer_receipt","both"].includes(purpose):!["preparation","both"].includes(purpose))continue;
  const routed=items.filter(item=>!departmentId||routes.some(route=>String(route.itemId??"")===String(item.menu_item_id)&&String(route.departmentId??"")===departmentId));if(!routed.length)continue;
  const includePrices=config.includePrices==="yes",includeCustomer=config.includeCustomer==="yes",includeNotes=config.includeNotes==="yes";
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
  if(["sections","tables"].includes(module)){const field=module==="sections"?"sectionId":"tableId";const [[used]]=await db.execute("SELECT COUNT(*) AS n FROM restaurant_resources WHERE tenant_id=? AND archived=FALSE AND id<>? AND JSON_UNQUOTE(JSON_EXTRACT(data,?))=? AND (kind='dining_table' OR status IN ('pending','confirmed','seated','in_progress'))",[tenantId,id,"$."+field,id]) as [RowDataPuÓ½µ¶‰ËkºwµçKİ[“[X™\Š^\İ[™ÖÌKİ[
Kİ\œ™[˜ŞN”İš[™Ê^\İ[™ÖÌK˜İ\œ™[˜ŞJ_NßBˆBˆ]ØZ]œ˜[˜Ú^\İÊ‹[˜[Yœ˜[˜ÚY
NÂˆ]™\Ù\˜][Û‘]N”™XÛÜ™İš[™Ë[šÛ›İÛŸ[[[ÂˆYŠ™\Ù\˜][Û’Y
^ÂˆYŠ›ÙK˜Ú[›™[OOH™[™WÚ[ˆŸXİ\İÛY\’Y
]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ”‘TÑT•USÓ—ÓÔ‘T—ÒS•SQŠNÂˆÛÛœİÜ™\Ù\˜][Ûœ×OX]ØZ]‹™^Xİ]O›İÑ]TXÚÙ]×OŠ”ÑSPÕYœ˜[˜ÚÚYİ]\Ë]H”“ÓH™\İ]\˜[Ü™\Ûİ\˜Ù\ÈÒT‘H[˜[ÚYOÈS‘YOÈS‘Ú[™IÜ™\Ù\˜][Û‰ÈS‘\˜Ú]™YQSÑHS‘İ]\ÈSˆ
	Ü[™[™ÉË	ØÛÛ™š\›YY	ÊHS‘œ˜[˜ÚÚYOÈ“ÔˆTUH‹İ[˜[Y™\Ù\˜][Û’Yœ˜[˜ÚYJNÂˆYŠ\™\Ù\˜][ÛœË›[™İ
]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ”‘TÑT•USÓ—Ó“ÕĞURSP“HŠNÂˆ™\Ù\˜][Û‘]O\\œÙQ]J™\Ù\˜][ÛœÖÌK™]JNÂˆÛÛœİØÚY[Y]Q]Kœ\œÙJİš[™Ê™\Ù\˜][Û‘]KœØÚY[Y]ÏÈˆŠJNÂˆYŠİš[™Ê™\Ù\˜][Û‘]K˜İ\İÛY\•\Ù\’YÏÈˆŠHOOXİ\İÛY\’YS[X™\‹š\Ñš[š]JØÚY[Y]
_ØÚY[Y]Q]K››İÊ
J]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ”‘TÑT•USÓ—Ó“ÕĞURSP“HŠNÂˆÛÛœİ\TÚ^™OS[X™\Š™\Ù\˜][Û‘]Kœ\TÚ^™JNÂˆYŠS[X™\‹š\Ò[YÙ\Š\TÚ^™J_\TÚ^™O_\TÚ^™OŒL
]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ”‘TÑT•USÓ—Ó“ÕĞURSP“HŠNÂˆÛÛœİÜš[Ü“Ü™\œ×OX]ØZ]‹™^Xİ]O›İÑ]TXÚÙ]×OŠ”ÑSPÕY”“ÓH™\İ]\˜[ÛÜ™\œÈÒT‘H[˜[ÚYOÈS‘™\Ù\˜][Û—ÚYOÈSRUH“ÔˆTUH‹İ[˜[Y™\Ù\˜][Û’YJNÂˆYŠš[Ü“Ü™\œË›[™İ
]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ”‘TÑT•USÓ—ĞS‘PQWÓÔ‘T‘QŠNÂˆBˆËÈ[™›Ü˜ÙHHØ[YH]˜Z[Xš[]H[\È›ÜˆÔËX›XÈY[K[™[Xİ]š]HİÜ™\Ë‚ˆÛÛœİÛÜ™\”ÛXÚY\×OX]ØZ]‹™^Xİ]O›İÑ]TXÚÙ]×OŠˆ”ÑSPÕÚ[™]H”“ÓH™\İ]\˜[Ü™\Ûİ\˜Ù\ÈÒT‘H[˜[ÚYOÈS‘\˜Ú]™YQSÑHS‘İ]\ÏIØXİ]™IÈS‘
Ú[™IÜİÜ™Yœ›ÛØÛÛ™šYÉÈÔˆ
Ú[™IØœ˜[˜ÚØÛÛ™šYÉÈS‘œ˜[˜ÚÚYOÊJHÔ‘Tˆ–HÜ™X]YØ]TĞÈ‹ˆİ[˜[Yœ˜[˜ÚYBˆ
NÂˆÛÛœİÜ\˜][™ÔÙ][™ÜÏJÚ[™œİš[™ÊOOØÛÛœİ›İÏ[Ü™\”ÛXÚY\Ë™š[™
][OOš][KšÚ[™OOZÚ[™
NÜ™]\›ˆ›İÏÜ\œÙQ]J›İË™]JNßNßNÂˆÛÛœİ]˜Z[Xš[]O[Ü™\Ú[›™[İ]\ÊÜ\˜][™ÔÙ][™ÜÊœİÜ™Yœ›ÛØÛÛ™šYÈŠKÜ\˜][™ÔÙ][™ÜÊ˜œ˜[˜ÚØÛÛ™šYÈŠKİš[™Ê›ÙK˜Ú[›™[
H\ÈÜ™\Ú[›™[
NÂˆYŠX]˜Z[Xš[]K˜[İÙY
]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ]˜Z[Xš[]Kœ™X\ÛÛˆJNÂˆ]İ[›ÛÛTÛ˜\ÚİÜ›ÛÛS[X™\œİš[™ß_[[[ÂˆYŠ›ÙK˜Ú[›™[OOHœ›ÛÛWÜÙ\šXÙHŠ^ÂˆÛÛœİÜ›ÛÛ\×OX]ØZ]‹™^Xİ]O›İÑ]TXÚÙ]×OŠ”ÑSPÕY”“ÓH™\İ]\˜[Ü™\Ûİ\˜Ù\ÈÒT‘H[˜[ÚYOÈS‘œ˜[˜ÚÚYOÈS‘Ú[™IÚİ[Ü›ÛÛIÈS‘ÛÚİ\ÚÙ^OOÈS‘İ]\ÏIØXİ]™IÈS‘\˜Ú]™YQSÑHSRUH“ÔˆTUH‹İ[˜[Yœ˜[˜ÚYœ˜[˜ÚY
ÈˆŠÜ›ÛÛS[X™\—JNÂˆYŠ\›ÛÛ\Ë›[™İ
]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ’ÕSÔ“ÓÓWÕSURSP“HŠNÂˆİ[›ÛÛTÛ˜\Úİ^Ü›ÛÛS[X™\ŸNÂˆBˆ]XÚİ\Ú[Û˜\ÚİÚYœİš[™ÎÛ˜[YNœİš[™ÎØY™\ÜÎœİš[™ÎÚ[œİXİ[ÛœÎœİš[™ß[ÛX\\›œİš[™ß[_[[[ÂˆYŠ›ÙK˜Ú[›™[OOHZÙX]Ø^HŠ^ÂˆYŠ›ÙKœXÚİ\Ú[YO[[	‰Š\[Ùˆ›ÙKœXÚİ\Ú[YOOHœİš[™ÈŸK×–ËXKYŒNW^ÌÍŸIÚK\İ
›ÙKœXÚİ\Ú[Y
JJ]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ”PÒÕTÔÒS•ÕSURSP“HŠNÂˆÛÛœİÜXÚİ\Ú[×OX]ØZ]‹™^Xİ]O›İÑ]TXÚÙ]×OŠ”ÑSPÕY˜[YK]H”“ÓH™\İ]\˜[Ü™\Ûİ\˜Ù\ÈÒT‘H[˜[ÚYOÈS‘œ˜[˜ÚÚYOÈS‘Ú[™IÜXÚİ\ÜÚ[	ÈS‘İ]\ÏIØXİ]™IÈS‘\˜Ú]™YQSÑHÔ‘Tˆ–H˜[YKY“ÔˆTUH‹İ[˜[Yœ˜[˜ÚYJNÂˆYŠXÚİ\Ú[Ë›[™İ	‰˜İ\İÛY\’Y	‰ˆX›ÙKœXÚİ\Ú[Y
]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ”PÒÕTÔÒS•Ô‘TURT‘QŠNÂˆYŠ›ÙKœXÚİ\Ú[Y
^ØÛÛœİÚ[\XÚİ\Ú[Ë™š[™
›İÏO”İš[™Ê›İËšY
OOOX›ÙKœXÚİ\Ú[Y
NÚYŠ\Ú[
]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ”PÒÕTÔÒS•ÕSURSP“HŠNØÛÛœİ]O\\œÙQ]JÚ[™]JNÜXÚİ\Ú[Û˜\Úİ^ÚY”İš[™ÊÚ[šY
K˜[YN”İš[™ÊÚ[›˜[YJKY™\ÜÎ”İš[™Ê]K˜Y™\ÜÏÏÈˆŠK[œİXİ[ÛœÎ™]Kš[œİXİ[ÛœÏÔİš[™Ê]Kš[œİXİ[ÛœÊN›[X\\›™]K›X\\›Ôİš[™Ê]K›X\\›
N›[NßBˆY[ÙHYŠ›ÙKœXÚİ\Ú[YO[[
]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ’S•SQÒS”UŠNÂˆÛÛœİ›Ùš[OX]ØZ]Ø[\Ô›Ùš[J‹[˜[Y
NÂˆYŠ›ÙK˜İ\œ™[˜ŞHOO][™Yš[™Y	‰˜›ÙK˜İ\œ™[˜ŞHOO\›Ùš[K˜İ\œ™[˜ŞJ]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠÕT”‘SÖWĞÒS‘ÑQŠNÂˆYŠ\›Ùš[K™[š[™É‰˜›ÙK˜Ú[›™[OOH™[™WÚ[ˆŠ]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠÒS“‘SÕSURSP“HŠNÂˆ]\ÜÚYÛ™Yš]™\’Yœİš[™ß[[[ÂˆYŠ›ÙK˜Ú[›™[OOH™[]™\HŠ^ÂˆËÈ]˜Z[Xš[]H\ÈÙ\™\‹Y[™›Ü˜ÙYˆHœ˜[˜Ú]\İ]™H[ˆXİ]™H\ÜÚYÛ™Yš]™\‹‚ˆÛÛœİÙš]™\œ×OX]ØZ]‹™^Xİ]O›İÑ]TXÚÙ]×OŠˆ”ÑSPÕKšY”“ÓH™\İ]\˜[Ü™\Ûİ\˜Ù\ÈH“ÒSˆY[X™\œÚ\ÈHÓˆK[˜[ÚYYK[˜[ÚYS‘K\Ù\—ÚYR”ÓÓ—ÕS”USÕJ”ÓÓ—ÑVPÕ
K™]K	É\Ù\’Y	ÊJHS‘Kœ›ÛOIÙš]™\‰ÈS‘Kœİ]\ÏIØXİ]™IÈ“ÒSˆ[\ŞYYWØœ˜[˜ÚØ\ÜÚYÛ›Y[ÈHÓˆK[˜[ÚYYK[˜[ÚYS‘K\Ù\—ÚY[K\Ù\—ÚYS‘K˜œ˜[˜ÚÚYOÈS‘K™[˜X›YU•QHÒT‘HK[˜[ÚYOÈS‘K˜œ˜[˜ÚÚYOÈS‘KšÚ[™IÙ[\ŞYYIÈS‘K˜\˜Ú]™YQSÑHS‘Kœİ]\ÏIØXİ]™IÈS‘”ÓÓ—ÕS”USÕJ”ÓÓ—ÑVPÕ
K™]K	Éœ›ÛIÊJOIÙš]™\‰ÈÔ‘Tˆ–HKšY“ÔˆTUH‹ˆØœ˜[˜ÚY[˜[Yœ˜[˜ÚYBˆ
NÂˆËÈÛ™HXİ]™H[]™\H\ˆš]™\‹ˆØÚÚ[™ÈH[YÚX›Hš]™\ˆ›İÜÈÙ\šX[^™\ÂˆËÈÛÛ˜İ\œ™[ÚXÚÛİ]ÈÛÈHØ[YH]˜Z[X›Hš]™\ˆØ[››İ™HİX›KX›ÛÚÙY‚ˆ›ÜŠÛÛœİš]™\ˆÙˆš]™\œÊ^ÂˆÛÛœİØXİ]™WOX]ØZ]‹™^Xİ]O›İÑ]TXÚÙ]×OŠ”ÑSPÕY”“ÓH™\İ]\˜[ÛÜ™\œÈÒT‘H[˜[ÚYOÈS‘Ú[›™[IÙ[]™\IÈS‘”ÓÓ—ÕS”USÕJ”ÓÓ—ÑVPÕ
ÚXÚÛİ]ÜÛ˜\Úİ	É˜\ÜÚYÛ™Yš]™\’Y	ÊJOOÈS‘İ]\È“ÕSˆ
	ØÛÛ\]Y	Ë	ØØ[˜Ù[Y	ÊHSRUH“ÔˆTUH‹İ[˜[Yİš[™Êš]™\‹šY
WJNÂˆYŠXXİ]™K›[™İ
^Ø\ÜÚYÛ™Yš]™\’YTİš[™Êš]™\‹šY
NØœ™XZÎßBˆBˆYŠX\ÜÚYÛ™Yš]™\’Y
]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ‘SU‘T–WÑ’U‘T—ÕSURSP“HŠNÂˆB‚ˆÛÛœİİØÚÑXš]Î”İØÚÑXš]×OV×NÂˆÛÛœİÚÚXÙ\Ï\›Ùš[K˜Ø][ÙÏØ]ØZ]Xİ]š]TÜÓÜ[ÛœÊ‹[˜[YØ\›X\
][OOš][KšY
KYJN˜]ØZ]Y[SÜ[ÛœÊ‹[˜[YØ\›X\
][OOš][KšY
JNÂˆÛÛœİ[™\ÎÚYœİš[™ÎÛ˜[YNœİš[™ÎÜ]X[]N›[X™\ÜšXÙN›[X™\İİ[›[X™\ÛÜ[ÛœÎÛ˜[YNœİš[™ÎÜšXÙN›[X™\ŸV×_V×OV×NÛ]İXİ[LÂˆ›ÜŠÛÛœİ][HÙˆË‹‹˜Ø\KœÛÜ

KŠOO”İš[™ÊKšY
K›ØØ[PÛÛ\\™Jİš[™Ê‹šY
JJJ^ÂˆYŠZ][_\[Ùˆ][KšYOOHœİš[™ÈŸ]˜[YØ][ÙÔ]X[]J][Kœ]X[]JJ]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ’S•SQĞĞT•ŠNÂˆÛÛœİÜ›İÜ×O\›Ùš[K˜Ø][ÙÏÖÖØ]ØZ]Xİ]š]TØ[R][J‹[˜[Yœ˜[˜ÚY][KšY
WWN˜]ØZ]‹™^Xİ]O›İÑ]TXÚÙ]×OŠ”ÑSPÕKšYK›˜[YKKœšXÙKK˜İ\œ™[˜ŞKK˜œ˜[˜ÚÚY”“ÓH™\İ]\˜[ÛY[WÚ][\ÈH“ÒSˆ™\İ]\˜[ÛY[WØØ]YÛÜšY\ÈÈÓˆËšYZK˜Ø]YÛÜWÚYS‘Ë[˜[ÚYZK[˜[ÚYS‘Ë™[˜X›YU•QHQ•“ÒSˆ™\İ]\˜[Ü™\Ûİ\˜Ù\ÈHÓˆKšYZKšYS‘K[˜[ÚYZK[˜[ÚYÒT‘HKšYOÈS‘K[˜[ÚYOÈS‘K™[˜X›YU•QHS‘ÓĞSTĞÑJK˜\˜Ú]™YSÑJOQSÑHSRUHĞÒÈSˆÒT‘HSÑH‹Ú][KšY[˜[YJNÂˆYŠ\›İÜË›[™İ›İÜÖÌK˜œ˜[˜ÚÚY	‰œ›İÜÖÌK˜œ˜[˜ÚÚYOOXœ˜[˜ÚY
]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ’USWÕSURSP“HŠNÂˆYŠ›İÜÖÌK˜İ\œ™[˜ŞHOO\›Ùš[K˜İ\œ™[˜ŞJ]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ•S”ÕTÔ•QĞÕT”‘SÖHŠNÂˆYŠS[X™\‹š\Ò[YÙ\Š][Kœ]X[]JI‰Š\›Ùš[K˜Ø][ÙßXØ][ÙÔ]X[]TÛXŞJ›İÜÖÌK˜]šX]\ÊK›YX\İ\™Y
J]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ’S•SQĞĞT•ŠNÂˆÛÛœİÙ[XİYZ][K›Ü[ÛœÏÏÖ×KÜ›İ\ÏXÚÚXÙ\ÖÚ][KšYOÏÖ×K˜[YYÜ›İ\Ë™›]X\
Ü›İ\O™Ü›İ\˜[Y\ÊNÂˆYŠ™]ÈÙ]
Ù[XİY
KœÚ^™HOO\Ù[XİY›[™İÙ[XİYœÛÛYJYOˆ]˜[YœÛÛYJO‹šYOOZY
JJ]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ’S•SQÓÔSÓ”ÈŠNÂˆ›ÜŠÛÛœİÜ›İ\ÙˆÜ›İ\Ê^ØÛÛœİÛİ[\Ù[XİY™š[\ŠYO™Ü›İ\˜[Y\ËœÛÛYJO‹šYOOZY
JK›[™İÚYŠÛİ[
Ü›İ\œ™\]Z\™YÓX]›X^
KÜ›İ\›Z[ŠN™Ü›İ\›Z[Š_Ûİ[ŠÜ›İ\\OOOHœÚ[™ÛHÓX]›Z[ŠKÜ›İ\›X^
N™Ü›İ\›X^
J]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ’S•SQÓÔSÓ”ÈŠNßBˆÛÛœİÜ[ÛœÏ]˜[Y™š[\ŠOœÙ[XİYš[˜ÛY\Ê‹šY
JK›X\
OŠÛ˜[YN‹›˜[YKšXÙN‹œšXÙ_JJNÂˆÛÛœİšXÙOSX]œ›İ[™
[X™\Š›İÜÖÌKœšXÙJJŒL
JÛÜ[ÛœËœ™YXÙJ
İ[KÜ[ÛŠOOœİ[JÓX]œ›İ[™
Ü[Û‹œšXÙJŒL
K
NÂˆYŠS[X™\‹š\Ñš[š]JšXÙJ_šXÙOšXÙOŒL
]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ’USWÕSURSP“HŠNÂˆYŠ›Ùš[K˜Ø][ÙÊ^Ø]ØZ]Xš]Ø][ÙÕ˜\šX[
‹[˜[Y][KšYÙ[XİY][Kœ]X[]KİØÚÑXš]ÊNØ]ØZ]Xš]Xİ]š]TİØÚÊ‹[˜[Yœ›ÙXİ‹][KšY][Kœ]X[]KİØÚÑXš]ÊNÙ›ÜŠÛÛœİÜ[ÛˆÙˆÙ[XİY
X]ØZ]Xš]Xİ]š]TİØÚÊ‹[˜[Y›Ü[Ûˆ‹Ü[Û‹][Kœ]X[]KİØÚÑXš]ÊNØ]ØZ][œİ\™PXİ]š]TØ[T™Y™\™[˜ÙJ‹[˜[Y›İÜÖÌJNßBˆ[ÙH]ØZ]‹™^Xİ]J’S”ÑT•QÓ“Ô‘HS•È™\İ]\˜[Ü™\Ûİ\˜Ù\ÊY[˜[ÚYÚ[™˜[YKİ]\Ë]JHSQTÈ
ËË	ÛY[WÚ][IËË	ØXİ]™IË	ŞßIÊH‹Ú][KšY[˜[Y›İÜÖÌK›˜[YWJNÂˆÛÛœİİ[SX]œ›İ[™
šXÙJ“X]œ›İ[™
][Kœ]X[]JŒL
KÌL
NÜİXİ[
Ï]İ[Û[™\Ëœ\Ú
ÚYš][KšY˜[YNœ›Ùš[K˜Ø][ÙÉ‰˜Ø][ÙÔ]X[]TÛXŞJ›İÜÖÌK˜]šX]\ÊK›YX\İ\™YÔİš[™Ê›İÜÖÌK›˜[YJKœÛXÙJMŠJÈˆÈŠØØ][ÙÔ]X[]TÛXŞJ›İÜÖÌK˜]šX]\ÊK[š]”İš[™Ê›İÜÖÌK›˜[YJK]X[]Nš][Kœ]X[]KšXÙNœšXÙKÌLİ[İ[ÌLÜ[ÛœßJNÂˆBˆYŠİXİ[NNNNNNNNNNNJ]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ’S•SQĞĞT•ŠNÂˆÛÛœİX›RYX›ÙK˜Ú[›™[OOH™[™WÚ[ˆ‰‰ˆ\™\Ù\˜][Û’Y	‰˜›ÙKX›RYÔİš[™Ê›ÙKX›RY
N›[ÂˆÛÛœİ\TÚ^™O\™\Ù\˜][Û‘]OÓ[X™\Š™\Ù\˜][Û‘]Kœ\TÚ^™JN“[X™\Š›ÙKœ\TÚ^™JNÂˆYŠ›ÙK˜Ú[›™[OOH™[™WÚ[ˆ‰‰Š]X›RY	‰ˆ\™\Ù\˜][Û‘]_S[X™\‹š\Ò[YÙ\Š\TÚ^™J_\TÚ^™OJJ]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ‘S’S‘×ÑURS×Ô‘TURT‘QŠNÂˆÛÛœİ[š[™Ï]X›RYØ]ØZ][š[™ÕX›J‹[˜[Yœ˜[˜ÚYX›RY[X™\Š›ÙKœ\TÚ^™JJN›[ÂˆYŠX›RY
^ÂˆËÈÙ\šX[^™HÜ™\œÈ›ÜˆHX›HÈ™]™[ÛÈÛÛ˜İ\œ™[ÚXÚÛİ]Èœ›ÛHZÚ[™È]‚ˆÛÛœİİ[™š[š\ÚYOX]ØZ]‹™^Xİ]O›İÑ]TXÚÙ]×OŠˆ”ÑSPÕY”“ÓH™\İ]\˜[ÛÜ™\œÈÒT‘H[˜[ÚYOÈS‘œ˜[˜ÚÚYOÈS‘X›WÚYOÈS‘
İ]\ÈTÈ•SÔˆİ]\È“ÕSˆ
	ØÛÛ\]Y	Ë	ØØ[˜Ù[Y	Ë	Ù[]™\™Y	Ë	Ü™Y[™Y	Ë	Ü™Z™XİY	ÊJHSRUH“ÔˆTUH‹ˆİ[˜[Yœ˜[˜ÚYX›RYBˆ
NÂˆYŠ[™š[š\ÚY›[™İ
]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ•P“WÒT×ÕS‘’S’TÒQÓÔ‘TˆŠNÂˆBˆ]Ûİ\Û’Yœİš[™ß[[[\ØÛİ[LÂˆYŠ›ÙK˜Ûİ\ÛÛÙJ^ÂˆÛÛœİÜ›İÜ×OX]ØZ]‹™^Xİ]O›İÑ]TXÚÙ]×OŠ”ÑSPÕY]H”“ÓH™\İ]\˜[Ü™\Ûİ\˜Ù\ÈÒT‘H[˜[ÚYOÈS‘Ú[™IØÛİ\Û‰ÈS‘ÛÚİ\ÚÙ^OOÈS‘İ]\ÏIØXİ]™IÈS‘\˜Ú]™YQSÑH“ÔˆTUH‹İ[˜[Yİš[™Ê›ÙK˜Ûİ\ÛÛÙJKš[J
KÕ\\Ø\ÙJ
WJNÂˆYŠ\›İÜË›[™İ
]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠÓÕTÓ—ÕSURSP“HŠNØÛÛœİÛİ\Û\\œÙQ]J›İÜÖÌK™]JNÂˆYŠÛİ\Û‹™[™Ğ]	‰‘]Kœ\œÙJİš[™ÊÛİ\Û‹™[™Ğ]
JOQ]K››İÊ
J]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠÓÕTÓ—ÕSURSP“HŠNÂˆYŠÛİ\Û‹\ØYÙS[Z]
^ØÛÛœİÖİ\ÙYWOX]ØZ]‹™^Xİ]O›İÑ]TXÚÙ]×OŠ”ÑSPÕÓÕS•

ŠHTÈˆ”“ÓH™\İ]\˜[ÛÜ™\œÈÒT‘H[˜[ÚYOÈS‘Ûİ\Û—ÚYOÈS‘İ]\Ï‰ØØ[˜Ù[Y	È‹İ[˜[Y›İÜÖÌKšYJNÚYŠ[X™\Š\ÙY›ŠOS[X™\ŠÛİ\Û‹\ØYÙS[Z]
J]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠÓÕTÓ—ÓSRUÔ‘PPÒQŠNßBˆÛİ\Û’YTİš[™Ê›İÜÖÌKšY
NÙ\ØÛİ[SX]›Z[ŠİXİ[Ûİ\Û‹™\ØÛİ[\OOOHœ\˜Ù[ÓX]œ›İ[™
İXİ[
“[X™\ŠÛİ\Û‹˜[YJKÌL
N“X]œ›İ[™
[X™\ŠÛİ\Û‹˜[YJJŒL
JNÂˆBˆÛÛœİİ\İÛY\“˜[YOX›ÙK˜İ\İÛY\“˜[YOO[[Û[”İš[™Ê›ÙK˜İ\İÛY\“˜[YJKš[J
KÛ™OX›ÙK˜İ\İÛY\”Û™OO[[Û[”İš[™Ê›ÙK˜İ\İÛY\”Û™JKš[J
NÂˆYŠ
İ\İÛY\“˜[YOË›[™İÏÌ
OŒN
Û™OË›[™İÏÌ
O
]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ’S•SQÒS”UŠNÂˆÛÛœİÚ]Ú[“›İ\ÏX›ÙKšÚ]Ú[“›İ\ÏO[[Û[”İš[™Ê›ÙKšÚ]Ú[“›İ\ÊKš[J
KÜ™\“›İ\ÏX›ÙK›Ü™\“›İ\ÏO[[Û[”İš[™Ê›ÙK›Ü™\“›İ\ÊKš[J
NÂˆYŠ
Ú]Ú[“›İ\ÏË›[™İÏÌ
OŒL
Ü™\“›İ\ÏË›[™İÏÌ
OŒL
]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ’S•SQÒS”UŠNÂˆÛÛœİÙ][™ÜÏX]ØZ]ÚXÚÛİ]Ù][™ÜÊ‹[˜[Y
NÂˆÛÛœİİ[ÏXÚXÚÛİ]İ[ÊİXİ[ÌL\ØÛİ[ÌLİš[™Ê›ÙK˜Ú[›™[
KÙ][™ÜËœÛXŞJNÂˆÛÛœİÛ˜\Úİ^İ™\œÚ[ÛŒK‹‹œÙ][™ÜË‹‹İ[Ë‹‹Š\ÜÚYÛ™Yš]™\’YŞØ\ÜÚYÛ™Yš]™\’YNßJK‹‹Š™\Ù\˜][Û’YŞÜ™\Ù\˜][Û’YNßJK‹‹ŠXÚİ\Ú[Û˜\ÚİŞÜXÚİ\Ú[œXÚİ\Ú[Û˜\ÚİNßJK‹‹Šİ[›ÛÛTÛ˜\ÚİŞÚİ[›ÛÛNšİ[›ÛÛTÛ˜\ÚİNßJ_NÂˆÛÛœİY\˜[™ÛUURQ

NÂˆ]ØZ]‹™^Xİ]J’S”ÑT•S•È™\İ]\˜[ÛÜ™\œÊY[˜[ÚYœ˜[˜ÚÚYX›WÚY™\Ù\˜][Û—ÚY[š[™×ÜÙXİ[Û—ÚY\WÜÚ^™K[š[™×ÜÛ˜\ÚİÛİ\Û—ÚYİ\İÛY\—Û˜[YKİ\İÛY\—ÜÛ™Kİ\İÛY\—İ\Ù\—ÚYÜ™X]YØK™\]Y\İÚÙ^K™\]Y\İÙš[™Ù\œš[Ú[›™[İXİ[\ØÛİ[İ[Ú]Ú[—Û›İ\ËÜ™\—Û›İ\Ëİ\œ™[˜ŞKÚXÚÛİ]ÜÛ˜\Úİ
HSQTÈ
ËËËËËËËËËËËËËËËËËËËËËËÊH‹ÚY[˜[Yœ˜[˜ÚYX›RY™\Ù\˜][Û’Y[š[™ÏËœÙXİ[Û’YÏÛ[›ÙK˜Ú[›™[OOH™[™WÚ[ˆÜ\TÚ^™N›[[š[™ÏÒ”ÓÓ‹œİš[™ÚYJ[š[™ÊN›[Ûİ\Û’Yİ\İÛY\“˜[YKÛ™Kİ\İÛY\’YXİÜ‹™\]Y\İÙ^Kš[™Ù\œš[İš[™Ê›ÙK˜Ú[›™[
KİXİ[ÌL\ØÛİ[ÌLİ[Ëİ[Ú]Ú[“›İ\ËÜ™\“›İ\Ë›Ùš[K˜İ\œ™[˜ŞK”ÓÓ‹œİš[™ÚYJÛ˜\Úİ
WJNÂˆYŠX›RY
X]ØZ]‹™^Xİ]J•TUH™\İ]\˜[Ü™\Ûİ\˜Ù\ÈÑUİ]\ÏIÛØØİ\YY	Ë™\œÚ[Û]™\œÚ[ÛŠÌHÒT‘HYOÈS‘[˜[ÚYOÈS‘Ú[™IÙ[š[™×İX›IÈS‘İ]\ÏIØ]˜Z[X›IÈ‹İX›RY[˜[YJNÂˆ›ÜŠÛÛœİ[™HÙˆ[™\ÊX]ØZ]‹™^Xİ]J’S”ÑT•S•È™\İ]\˜[ÛÜ™\—Ú][\ÊY[˜[ÚYÜ™\—ÚYY[WÚ][WÚY][WÛ˜[YK]X[]K[š]ÜšXÙK[™Wİİ[Ü[Ûœ×ÜÛ˜\Úİ
HSQTÈ
ËËËËËËËËÊH‹Ü˜[™ÛUURQ

K[˜[YY[™KšY[™K›˜[YK[™Kœ]X[]K[™KœšXÙK[™Kİ[”ÓÓ‹œİš[™ÚYJ[™K›Ü[ÛœÊWJNÂˆ]ØZ]]Y]YSÜ™\”š[›ØœÊ‹[˜[YY›Û—ØXØÙ\ŠNÂˆ]ØZ]]Y]
‹[˜[YXİÜ‹›Ü™\‹˜Ü™X]H‹Yİİ[İ[Ëİ[‹‹Š›Ùš[K˜Ø][ÙÏŞÜİØÚÑXš]Ëİ\œ™[˜ŞNœ›Ùš[K˜İ\œ™[˜Ş_NßJ_JNÂˆ]ØZ]›İYSÜ™\Š‹[˜[YY›™]ÈŠNÂˆ™]\›ˆÚYİ[İ[Ëİ[İ\œ™[˜ŞNœ›Ùš[K˜İ\œ™[˜Ş_NÂŸB™^Ü\Ş[˜È[˜İ[Ûˆ\]SÜ™\Š”ÛÛÛÛ›™Xİ[Û‹[˜[Yœİš[™ËXİÜœİš[™Ë›ÛNœİš[™Ë›ÙN”™XÛÜ™İš[™Ë[šÛ›İÛŠ^ÂˆYŠ\[Ùˆ›ÙKšYOOHœİš[™ÈŠ]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ’S•SQÒS”UŠNÂˆÛÛœİÜ›İÜ×OX]ØZ]‹™^Xİ]O›İÑ]TXÚÙ]×OŠ”ÑSPÕYİ]\Ë^[Y[Üİ]\Ë™\œÚ[Û‹Ú[›™[X›WÚYœ˜[˜ÚÚYÚXÚÛİ]ÜÛ˜\Úİ”“ÓH™\İ]\˜[ÛÜ™\œÈÒT‘HYOÈS‘[˜[ÚYOÈ“ÔˆTUH‹Ø›ÙKšY[˜[YJNØÛÛœİÜ™\\›İÜÖÌNÂˆYŠ[Ü™\Š]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ“Ô‘T—Ó“ÕÑ“ÕS‘ŠNÂˆYŠS[X™\‹š\Ò[YÙ\Š›ÙK™\œÚ[ÛŠ_[X™\Š›ÙK™\œÚ[ÛŠHOOS[X™\ŠÜ™\‹™\œÚ[ÛŠJ]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠÓÓ‘“PÕŠNÂˆYŠ›ÛOOOH™š]™\ˆŠ^ÂˆÛÛœİÛ˜\Úİ[Ü™\‹˜ÚXÚÛİ]ÜÛ˜\ÚİÜ\œÙQ]JÜ™\‹˜ÚXÚÛİ]ÜÛ˜\Úİ
NßNÂˆÛÛœİØ\ÜÚYÛ™YOX]ØZ]‹™^Xİ]O›İÑ]TXÚÙ]×OŠ”ÑSPÕKšY”“ÓH™\İ]\˜[Ü™\Ûİ\˜Ù\ÈH“ÒSˆY[X™\œÚ\ÈHÓˆK[˜[ÚYYK[˜[ÚYS‘K\Ù\—ÚYR”ÓÓ—ÕS”USÕJ”ÓÓ—ÑVPÕ
K™]K	É\Ù\’Y	ÊJHS‘Kœ›ÛOIÙš]™\‰ÈS‘Kœİ]\ÏIØXİ]™IÈ“ÒSˆ[\ŞYYWØœ˜[˜ÚØ\ÜÚYÛ›Y[ÈHÓˆK[˜[ÚYYK[˜[ÚYS‘K\Ù\—ÚY[K\Ù\—ÚYS‘K˜œ˜[˜ÚÚYYK˜œ˜[˜ÚÚYS‘K™[˜X›YU•QHÒT‘HK[˜[ÚYOÈS‘K˜œ˜[˜ÚÚYOÈS‘KšÚ[™IÙ[\ŞYYIÈS‘K˜\˜Ú]™YQSÑHS‘Kœİ]\ÏIØXİ]™IÈS‘”ÓÓ—ÕS”USÕJ”ÓÓ—ÑVPÕ
K™]K	É\Ù\’Y	ÊJOOÈS‘”ÓÓ—ÕS”USÕJ”ÓÓ—ÑVPÕ
K™]K	Éœ›ÛIÊJOIÙš]™\‰ÈS‘KšYOÈSRUH“ÔˆTUH‹İ[˜[Yİš[™ÊÜ™\‹˜œ˜[˜ÚÚY
KXİÜ‹İš[™ÊÛ˜\Úİ˜\ÜÚYÛ™Yš]™\’YÏÈˆŠWJNÂˆYŠÜ™\‹˜Ú[›™[OOH™[]™\HŸX\ÜÚYÛ™Y›[™İ
]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ‘“Ô’QSˆŠNÂˆBˆ]İ]\ÏTİš[™ÊÜ™\‹œİ]\ÊK^[Y[Tİš[™ÊÜ™\‹œ^[Y[Üİ]\ÊNÂˆYŠ›ÙKœİ]\ÈOO][™Yš[™Y
^ÂˆÛÛœİ™^Tİš[™Ê›ÙKœİ]\ÊK˜[œÚ][ÛœÎ”™XÛÜ™İš[™Ëİš[™Ö×O^Û™]Î–Èœ™\\š[™È‹˜Ø[˜Ù[Y—K™\\š[™Î–Èœ™XYH‹˜Ø[˜Ù[Y—K™XYN–È˜ÛÛ\]Y‹˜Ø[˜Ù[Y—KÛÛ\]Y–×KØ[˜Ù[Y–×_NÂˆYŠ]˜[œÚ][ÛœÖÜİ]\×Kš[˜ÛY\Ê™^
J]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ’S•SQÕS”ÒUSÓˆŠNÂˆYŠ›ÛOOOHšÚ]Ú[ˆ‰‰ˆJİ]\ÏOOH›™]È‰‰›™^OOHœ™\\š[™ÈŸİ]\ÏOOHœ™\\š[™È‰‰›™^OOHœ™XYHŠ_›ÛOOOHØZ]\ˆ‰‰ˆJİ]\ÏOOHœ™XYH‰‰›™^OOH˜ÛÛ\]YŠ_›ÛOOOH™š]™\ˆ‰‰ˆJÜ™\‹˜Ú[›™[OOH™[]™\H‰‰œİ]\ÏOOHœ™XYH‰‰›™^OOH˜ÛÛ\]YŠ_›ÛOOOH˜XØÛİ[[Š]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ‘“Ô’QSˆŠNÂˆYŠ™^OOH˜Ø[˜Ù[Y‰‰œ^[Y[OOHœZYŠ]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ”‘Q•S‘Ô‘TURT‘QŠNÜİ]\Ï[™^ÂˆBˆYŠ›ÙKœ^[Y[İ]\ÈOO][™Yš[™Y
^ÂˆYŠVÈ›İÛ™\ˆ‹›X[˜YÙ\ˆ‹˜Ø\ÚY\ˆ—Kš[˜ÛY\Ê›ÛJJ]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ‘“Ô’QSˆŠNÂˆÛÛœİ™^Tİš[™Ê›ÙKœ^[Y[İ]\ÊNÂˆYŠJ^[Y[OOH[œZY‰‰›™^OOHœZY‰‰œİ]\ÈOOH˜Ø[˜Ù[YŸ^[Y[OOHœZY‰‰›™^OOHœ™Y[™YŠJ]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ’S•SQÔVSQS•ÕS”ÒUSÓˆŠNÜ^[Y[[™^ÂˆBˆYŠ›ÙKœİ]\ÏOO][™Yš[™Y	‰˜›ÙKœ^[Y[İ]\ÏOO][™Yš[™Y
]›İÈ™]È™\Ûİ\˜ÙQ\œ›ÜŠ’S•SQÒS”UŠNÂˆYŠİ]\ÏOOH˜Ø[˜Ù[Y‰‰›Ü™\‹œİ]\ÈOOH˜Ø[˜Ù[YŠX]ØZ]™\İÜ™PXİ]š]TİØÚÊ‹[˜[Yİš[™ÊÜ™\‹šY
JNÂˆ]ØZ]‹™^Xİ]J•TUH™\İ]\˜[ÛÜ™\œÈÑUİ]\ÏOË^[Y[Üİ]\ÏOË™\œÚ[Û]™\œÚ[ÛŠÌHÒT‘HYOÈS‘[˜[ÚYOÈ‹Üİ]\Ë^[Y[Ü™\‹šY[˜[YJNÂˆYŠİ]\ÈOOTİš[™ÊÜ™\‹œİ]\ÊI‰œİ]\ÏOOHœ™\\š[™ÈŠX]ØZ]]Y]YSÜ™\”š[›ØœÊ‹[˜[Yİš[™ÊÜ™\‹šY
K›Û—Ü™\\™HŠNÂˆYŠ^[Y[OOTİš[™ÊÜ™\‹œ^[Y[Üİ]\ÊI‰œ^[Y[OOHœZYŠX]ØZ]]Y]YSÜ™\”š[›ØœÊ‹[˜[Yİš[™ÊÜ™\‹šY
K›Û—ÜZYŠNÂˆËÈHÛÛ\]YÜ™\ˆÙ\È›İ›İ™H]HİY\İ\ÈY‚ˆËÈÙY\HX›HØØİ\YY[[İY™ˆ^XÚ]HÛÛ™š\›\È\\\™K‚ˆYŠİ]\ÈOOTİš[™ÊÜ™\‹œİ]\ÊJX]ØZ]›İYSÜ™\Š‹[˜[Yİš[™ÊÜ™\‹šY
Kİ]\ÊNÂˆYŠ^[Y[OOTİš[™ÊÜ™\‹œ^[Y[Üİ]\ÊJX]ØZ]›İYSÜ™\Š‹[˜[Yİš[™ÊÜ™\‹šY
K^[Y[YJNÂˆ]ØZ]]Y]
‹[˜[YXİÜ‹›Ü™\‹\]H‹İš[™ÊÜ™\‹šY
KÜİ]\Ë^[Y[İ]\Îœ^[Y[JNÜ™]\›ˆÚY›Ü™\‹šYNÂŸB‚‚