import {randomUUID} from "node:crypto";
import type {PoolConnection,ResultSetHeader,RowDataPacket} from "mysql2/promise";

/** Called inside the already-confirmed order payment transaction.
 * Snapshots are immutable and a unique (tenant, order, kind) protects replay.
 * This is a payment receipt; tax invoices require a separately validated tax flow.
 */
export async function issuePaidOrderInvoice(db:PoolConnection,tenantId:string,orderId:string){
 const [orders]=await db.execute<RowDataPacket[]>(
  "SELECT o.id,o.branch_id,o.order_number,o.customer_user_id,o.payment_status,o.status,o.subtotal,o.discount,o.total,o.currency,o.checkout_snapshot,t.name AS store_name,u.email,u.email_verified_at,u.default_locale "+
  "FROM restaurant_orders o JOIN tenants t ON t.id=o.tenant_id JOIN users u ON u.id=o.customer_user_id AND u.status='active' "+
  "WHERE o.tenant_id=? AND o.id=? LIMIT 1",[tenantId,orderId]);
 const order=orders[0];
 if(!order||order.payment_status!=="paid"||["cancelled","rejected","refunded"].includes(String(order.status)))return null;
 const [items]=await db.execute<RowDataPacket[]>(
  "SELECT item_name,quantity,unit_price,line_total,options_snapshot FROM restaurant_order_items WHERE tenant_id=? AND order_id=? ORDER BY id",
  [tenantId,orderId]);
 let checkout:Record<string,unknown>={};
 try{checkout=typeof order.checkout_snapshot==="string"?JSON.parse(order.checkout_snapshot):order.checkout_snapshot??{};}catch{}
 const invoiceId=randomUUID(),number="FOON-ORD-"+orderId;
 const detail={version:1,documentType:"payment_receipt",orderId,orderNumber:String(order.order_number),
  seller:checkout.seller??{name:String(order.store_name)},channel:checkout.channel??null,
  lines:items.map(item=>({name:String(item.item_name),quantity:Number(item.quantity),unitPrice:String(item.unit_price),total:String(item.line_total),
   options:typeof item.options_snapshot==="string"?item.options_snapshot:null})),
  subtotal:String(order.subtotal),discount:String(order.discount),
  serviceFee:checkout.serviceFee??null,deliveryFee:checkout.deliveryFee??null,tax:checkout.tax??null,
  total:String(order.total),currency:String(order.currency)};
 const canEmail=Boolean(order.email_verified_at&&String(order.email??"").trim());
 const [insert]=await db.execute<ResultSetHeader>(
  "INSERT IGNORE INTO restaurant_customer_invoices(id,tenant_id,branch_id,order_id,customer_user_id,invoice_number,invoice_kind,invoice_json,currency,total,email_status) "+
  "VALUES (?,?,?,?,?,?,'receipt',?,?,?,?)",
  [invoiceId,tenantId,order.branch_id,orderId,order.customer_user_id,number,JSON.stringify(detail),order.currency,order.total,canEmail?"pending":"skipped"]);
 if(insert.affectedRows===0)return null;
 const lang=String(order.default_locale);
 const subject=lang==="fr"?"Reçu de commande #"+order.order_number:lang==="en"?"Order receipt #"+order.order_number:"إيصال الطلب #"+order.order_number;
 const origin=String(process.env.APP_URL||process.env.NEXT_PUBLIC_SITE_URL||process.env.APP_BASE_URL||"https://nfoodz.com").replace(/\/$/,"");
 const view=origin+"/receipts/"+orderId;
 const message=lang==="fr"?
  "Votre paiement a été confirmé. Reçu "+number+". Total : "+order.total+" "+order.currency+". Connectez-vous pour consulter le reçu : "+view+" (ce n'est pas une facture fiscale certifiée).":
  lang==="en"?"Your payment was confirmed. Receipt "+number+". Total: "+order.total+" "+order.currency+". Sign in to view: "+view+" (not a certified tax invoice).":
  "تم تأكيد سداد طلبك. رقم الإيصال "+number+". الإجمالي: "+order.total+" "+order.currency+". عرض الإيصال بعد تسجيل الدخول: "+view+" (إيصال دفع وليس فاتورة ضريبية معتمدة).";
 await db.execute("INSERT INTO customer_notifications(id,user_id,tenant_id,event_key,subject,body_text,resource_id) VALUES (?,?,?,?,?,?,?)",
  [randomUUID(),order.customer_user_id,tenantId,"order_invoice",subject,message,orderId]);
 if(canEmail)await db.execute(
  "INSERT INTO platform_notification_outbox(id,event_key,tenant_id,recipient_email,subject,body_text) VALUES (?,'order_invoice',?,?,?,?)",
  [invoiceId,tenantId,String(order.email),subject,message]);
 return {id:invoiceId,number,emailQueued:canEmail};
}
