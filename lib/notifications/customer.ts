import {issuePaidOrderInvoice} from "@/lib/billing/order-invoices";
import {randomUUID} from 'node:crypto';
import type {PoolConnection,RowDataPacket} from 'mysql2/promise';
import {notificationCopy} from '../../scripts/customer-notification-copy.mjs';
export async function notifyCustomer(db:PoolConnection,input:{userId:string;tenantId:string;event:string;resourceId:string;reference?:string;status?:string}){
 const [rows]=await db.execute<RowDataPacket[]>('SELECT u.email,u.default_locale,t.name FROM users u JOIN tenants t ON t.id=? WHERE u.id=? AND u.status=\'active\' LIMIT 1',[input.tenantId,input.userId]);
 if(!rows.length)return;
 const user=rows[0],copy=notificationCopy(String(user.default_locale),input.event,{store:String(user.name),reference:input.reference??'',status:input.status});
 copy.subject=copy.subject.slice(0,250);
 const policyKey=input.event==='order_preparing'?'order_confirmed':input.event==='order_new'?'order_received':input.event;
 const [rules]=await db.execute<RowDataPacket[]>('SELECT enabled,in_app_enabled,email_enabled FROM platform_notification_rules WHERE event_key=? LIMIT 1',[policyKey]);
 const rule=rules[0];if(rule&&!rule.enabled)return;
 // In-account notifications must not depend on email verification or SMTP availability.
 if(!rule||rule.in_app_enabled)await db.execute('INSERT INTO customer_notifications(id,user_id,tenant_id,event_key,subject,body_text,resource_id) VALUES (?,?,?,?,?,?,?)',[randomUUID(),input.userId,input.tenantId,input.event,copy.subject,copy.text,input.resourceId]);
 if(!rule||rule.email_enabled)await db.execute('INSERT INTO platform_notification_outbox(id,event_key,tenant_id,recipient_email,subject,body_text) VALUES (?,?,?,?,?,?)',[randomUUID(),input.event,input.tenantId,user.email,copy.subject,copy.text]);
}
export async function notifyOrder(db:PoolConnection,tenantId:string,id:string,status:string,payment=false){
 if(payment&&status==='paid'){await issuePaidOrderInvoice(db,tenantId,id);return;}
 const [rows]=await db.execute<RowDataPacket[]>('SELECT customer_user_id,order_number FROM restaurant_orders WHERE tenant_id=? AND id=? LIMIT 1',[tenantId,id]);
 if(rows[0]?.customer_user_id)await notifyCustomer(db,{userId:String(rows[0].customer_user_id),tenantId,event:payment?'order_payment_'+status:'order_'+status,resourceId:id,reference:String(rows[0].order_number),status});
}
