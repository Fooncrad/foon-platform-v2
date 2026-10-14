import {randomUUID} from "node:crypto";
import type {PoolConnection,RowDataPacket} from "mysql2/promise";
import {majorToMinor,type VerifiedPaymentWebhook} from "./webhook-verification.mjs";
type Endpoint={tenant_id:string;scope_key:string;endpoint_id:string;provider:string;mode:string};
/** Called only by a trusted server-side gateway initiation adapter after it creates the provider transaction. */
export async function registerPaymentAttempt(db:PoolConnection,input:{tenantId:string;scope:string;orderId:string;provider:string;mode:"test"|"live";paymentId:string}){
 if(!["moyasar","tap","stripe","hyperpay"].includes(input.provider))throw Error("UNSUPPORTED_WEBHOOK_PROVIDER");
 if(!input.paymentId||input.paymentId.length>180)throw Error("INVALID_PAYMENT_ID");
 const [settings]=await db.execute<RowDataPacket[]>("SELECT provider,mode FROM tenant_payment_gateway_credentials WHERE tenant_id=? AND scope_key=? FOR UPDATE",[input.tenantId,input.scope]);
 if(settings[0]?.provider!==input.provider||settings[0]?.mode!==input.mode)throw Error("PAYMENT_CONFIGURATION_CHANGED");
 const [rows]=await db.execute<RowDataPacket[]>("SELECT branch_id,total,currency,status,payment_status FROM restaurant_orders WHERE tenant_id=? AND id=? FOR UPDATE",[input.tenantId,input.orderId]);
 const order=rows[0];if(!order||order.status==="cancelled"||order.payment_status!=="unpaid"||input.scope!=="tenant"&&order.branch_id!==input.scope)throw Error("ORDER_NOT_PAYABLE");
 await db.execute("INSERT INTO tenant_payment_attempts(id,tenant_id,scope_key,order_id,branch_id,provider,mode,provider_payment_id,amount_minor,currency) VALUES (?,?,?,?,?,?,?,?,?,?)",[randomUUID(),input.tenantId,input.scope,input.orderId,order.branch_id,input.provider,input.mode,input.paymentId,majorToMinor(String(order.total),String(order.currency)),order.currency]);
 // A gateway can deliver its webhook before its creation response reaches FOON.
 // Reconcile the already authenticated minimal receipt as soon as the trusted adapter binds the ID.
 const [early]=await db.execute<RowDataPacket[]>("SELECT endpoint_id,event_key,event_type,payment_id,amount_minor,currency FROM tenant_payment_webhook_receipts WHERE tenant_id=? AND scope_key=? AND provider=? AND mode=? AND payment_id=? AND status='unmatched' ORDER BY sequence_id",[input.tenantId,input.scope,input.provider,input.mode,input.paymentId]);
 for(const row of early)await persistPaymentWebhook(db,{tenant_id:input.tenantId,scope_key:input.scope,endpoint_id:String(row.endpoint_id),provider:input.provider,mode:input.mode},{eventKey:String(row.event_key),eventType:String(row.event_type),paymentId:String(row.payment_id),amountMinor:Number(row.amount_minor),currency:String(row.currency),paid:true});
}
export async function persistPaymentWebhook(db:PoolConnection,endpoint:Endpoint,event:VerifiedPaymentWebhook){
 // Caller holds the endpoint lock and commits only after this function persists the receipt.
 const [existing]=await db.execute<RowDataPacket[]>("SELECT id,status FROM tenant_payment_webhook_receipts WHERE endpoint_id=? AND event_key=?",[endpoint.endpoint_id,event.eventKey]);
 if(existing.length&&existing[0].status!=="unmatched")return {duplicate:true,status:String(existing[0].status)};
 let status=event.paid?"unmatched":"ignored";
 if(event.paid&&endpoint.mode==="test")status="test_received";
 if(event.paid&&endpoint.mode==="live"){
  const [attempts]=await db.execute<RowDataPacket[]>("SELECT id,order_id,branch_id,amount_minor,currency,status FROM tenant_payment_attempts WHERE tenant_id=? AND scope_key=? AND provider=? AND mode=? AND provider_payment_id=? FOR UPDATE",[endpoint.tenant_id,endpoint.scope_key,endpoint.provider,endpoint.mode,event.paymentId]);
  const attempt=attempts[0];
  if(attempt){
   const [orders]=await db.execute<RowDataPacket[]>("SELECT branch_id,total,currency,status,payment_status FROM restaurant_orders WHERE tenant_id=? AND id=? FOR UPDATE",[endpoint.tenant_id,attempt.order_id]);
   const order=orders[0];
   if(!order||order.branch_id!==attempt.branch_id||endpoint.scope_key!=="tenant"&&order.branch_id!==endpoint.scope_key)status="scope_mismatch";
   else if(Number(attempt.amount_minor)!==event.amountMinor||attempt.currency!==event.currency||order.currency!==event.currency||majorToMinor(String(order.total),String(order.currency))!==event.amountMinor)status="amount_mismatch";
   else if(order.status==="cancelled"||order.payment_status==="refunded")status="review_required";
   else if(order.payment_status==="paid")status="already_paid";
   else{
    await db.execute("UPDATE restaurant_orders SET payment_status='paid',version=version+1 WHERE tenant_id=? AND id=? AND payment_status='unpaid'",[endpoint.tenant_id,attempt.order_id]);
    await db.execute("UPDATE tenant_payment_attempts SET status='paid' WHERE tenant_id=? AND id=?",[endpoint.tenant_id,attempt.id]);
    status="paid";
   }
  }
 }
 if(existing.length){await db.execute("UPDATE tenant_payment_webhook_receipts SET status=? WHERE id=? AND tenant_id=?",[status,existing[0].id,endpoint.tenant_id]);return {duplicate:true,status};}
 await db.execute("INSERT INTO tenant_payment_webhook_receipts(id,tenant_id,scope_key,endpoint_id,provider,mode,event_key,payment_id,event_type,amount_minor,currency,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",[randomUUID(),endpoint.tenant_id,endpoint.scope_key,endpoint.endpoint_id,endpoint.provider,endpoint.mode,event.eventKey,event.paymentId,event.eventType,event.amountMinor,event.currency,status]);
 return {duplicate:false,status};
}

