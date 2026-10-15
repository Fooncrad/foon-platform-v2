import {randomUUID,createHash} from "node:crypto";
import type {PoolConnection,RowDataPacket} from "mysql2/promise";
import {majorToMinor,currencyDecimals,type VerifiedPaymentWebhook} from "./webhook-verification.mjs";
type Endpoint={tenant_id:string;scope_key:string;endpoint_id:string;provider:string;mode:string};
/** Called only by a trusted server-side gateway initiation adapter after it creates the provider transaction. */
export async function registerPaymentAttempt(db:PoolConnection,input:{tenantId:string;scope:string;orderId:string;provider:string;mode:"test"|"live";paymentId:string}){
 if(!["moyasar","tap","stripe","hyperpay"].includes(input.provider))throw Error("UNSUPPORTED_WEBHOOK_PROVIDER");
 if(!input.paymentId||input.paymentId.length>180)throw Error("INVALID_PAYMENT_ID");
 const [settings]=await db.execute<RowDataPacket[]>("SELECT provider,mode FROM tenant_payment_gateway_credentials WHERE tenant_id=? AND scope_key=? FOR UPDATE",[input.tenantId,input.scope]);
 if(settings[0]?.provider!==input.provider||settings[0]?.mode!==input.mode)throw Error("PAYMENT_CONFIGURATION_CHANGED");
 const [serviceCollision]=await db.execute<RowDataPacket[]>("SELECT id FROM tenant_service_invoice_payment_attempts WHERE provider=? AND mode=? AND BINARY provider_payment_id=BINARY ? LIMIT 1",[input.provider,input.mode,input.paymentId]);
 if(serviceCollision.length)throw Error("PROVIDER_PAYMENT_ALREADY_BOUND");
 const [rows]=await db.execute<RowDataPacket[]>("SELECT branch_id,total,currency,status,payment_status FROM restaurant_orders WHERE tenant_id=? AND id=? FOR UPDATE",[input.tenantId,input.orderId]);
 const order=rows[0];if(!order||order.status==="cancelled"||order.payment_status!=="unpaid"||input.scope!=="tenant"&&order.branch_id!==input.scope)throw Error("ORDER_NOT_PAYABLE");
 await db.execute("INSERT INTO tenant_payment_attempts(id,tenant_id,scope_key,order_id,branch_id,provider,mode,provider_payment_id,amount_minor,currency) VALUES (?,?,?,?,?,?,?,?,?,?)",[randomUUID(),input.tenantId,input.scope,input.orderId,order.branch_id,input.provider,input.mode,input.paymentId,majorToMinor(String(order.total),String(order.currency)),order.currency]);
 // A gateway can deliver its webhook before its creation response reaches FOON.
 // Reconcile the already authenticated minimal receipt as soon as the trusted adapter binds the ID.
 const [early]=await db.execute<RowDataPacket[]>("SELECT endpoint_id,event_key,event_type,payment_id,amount_minor,currency FROM tenant_payment_webhook_receipts WHERE tenant_id=? AND scope_key=? AND provider=? AND mode=? AND payment_id=? AND status IN ('unmatched','test_received') ORDER BY sequence_id",[input.tenantId,input.scope,input.provider,input.mode,input.paymentId]);
 for(const row of early)await persistPaymentWebhook(db,{tenant_id:input.tenantId,scope_key:input.scope,endpoint_id:String(row.endpoint_id),provider:input.provider,mode:input.mode},{eventKey:String(row.event_key),eventType:String(row.event_type),paymentId:String(row.payment_id),amountMinor:Number(row.amount_minor),currency:String(row.currency),paid:true});
}
/** Called only after a trusted provider adapter has created the service payment.
 * Never expose this function as an API that accepts a provider ID from a browser.
 */
export async function registerServiceInvoicePaymentAttempt(db:PoolConnection,input:{tenantId:string;scope:string;invoiceId:string;provider:string;mode:"test"|"live";paymentId:string}){
 if(!["moyasar","tap","stripe","hyperpay"].includes(input.provider)||typeof input.paymentId!=="string"||!input.paymentId||input.paymentId.length>180)throw Error("INVALID_PAYMENT_ID");
 const [settings]=await db.execute<RowDataPacket[]>("SELECT g.provider,g.mode,s.currency FROM tenant_payment_gateway_credentials g JOIN tenant_payment_settings s ON s.tenant_id=g.tenant_id AND s.scope_key=g.scope_key WHERE g.tenant_id=? AND g.scope_key=? FOR UPDATE",[input.tenantId,input.scope]);
 const setting=settings[0];if(!setting||setting.provider!==input.provider||setting.mode!==input.mode)throw Error("PAYMENT_CONFIGURATION_CHANGED");
 const [invoices]=await db.execute<RowDataPacket[]>("SELECT id,branch_id,status,data FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='customer_invoice' AND archived=FALSE FOR UPDATE",[input.invoiceId,input.tenantId]);
 const invoice=invoices[0];if(!invoice||invoice.status!=="issued"||input.scope!=="tenant"&&invoice.branch_id!==input.scope)throw Error("INVOICE_NOT_PAYABLE");
 const data=typeof invoice.data==="string"?JSON.parse(invoice.data):invoice.data;
 if(!data||typeof data.serviceOrderId!=="string"||data.orderId)throw Error("SERVICE_INVOICE_REQUIRED");
 const [services]=await db.execute<RowDataPacket[]>("SELECT status,branch_id,data FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='service_order' AND archived=FALSE FOR UPDATE",[data.serviceOrderId,input.tenantId]);
 const service=services[0];
 if(!service||service.status!=="completed"||service.branch_id&&service.branch_id!==invoice.branch_id)throw Error("SERVICE_NOT_COMPLETED");
 const serviceData=typeof service.data==="string"?JSON.parse(service.data):service.data;
 const precision=10**currencyDecimals(String(setting.currency));
 const components=[data.subtotal,data.taxAmount??0,data.serviceFee??0].map(Number);
 if(components.some(v=>!Number.isFinite(v)||v<0||Math.abs(v*precision-Math.round(v*precision))>0.000001))throw Error("INVOICE_AMOUNT_INVALID");
 const amountMinor=components.reduce((sum,v)=>sum+Math.round(v*precision),0);
 if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor!==majorToMinor(String(serviceData.amount),String(setting.currency)))throw Error("SERVICE_INVOICE_AMOUNT_MISMATCH");
 const [priorProof]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND kind='invoice_settlement' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.invoiceId'))=? LIMIT 1 FOR UPDATE",[input.tenantId,input.invoiceId]);
 if(priorProof.length)throw Error("INVOICE_ALREADY_SETTLED");
 // Both order and service registrations serialize through the same gateway row.
 const [other]=await db.execute<RowDataPacket[]>("SELECT id FROM tenant_payment_attempts WHERE provider=? AND mode=? AND BINARY provider_payment_id=BINARY ? LIMIT 1",[input.provider,input.mode,input.paymentId]);
 if(other.length)throw Error("PROVIDER_PAYMENT_ALREADY_BOUND");
 const [pending]=await db.execute<RowDataPacket[]>("SELECT id FROM tenant_service_invoice_payment_attempts WHERE tenant_id=? AND invoice_id=? LIMIT 1 FOR UPDATE",[input.tenantId,input.invoiceId]);
 if(pending.length)throw Error("SERVICE_INVOICE_PAYMENT_ATTEMPT_EXISTS");
 const id=randomUUID();
 await db.execute("INSERT INTO tenant_service_invoice_payment_attempts(id,tenant_id,scope_key,invoice_id,branch_id,provider,mode,provider_payment_id,amount_minor,currency) VALUES (?,?,?,?,?,?,?,?,?,?)",[id,input.tenantId,input.scope,input.invoiceId,invoice.branch_id,input.provider,input.mode,input.paymentId,amountMinor,setting.currency]);
 const [early]=await db.execute<RowDataPacket[]>("SELECT endpoint_id,event_key,event_type,payment_id,amount_minor,currency FROM tenant_payment_webhook_receipts WHERE tenant_id=? AND scope_key=? AND provider=? AND mode=? AND BINARY payment_id=BINARY ? AND status IN ('unmatched','test_received') ORDER BY sequence_id",[input.tenantId,input.scope,input.provider,input.mode,input.paymentId]);
 for(const row of early)await persistPaymentWebhook(db,{tenant_id:input.tenantId,scope_key:input.scope,endpoint_id:String(row.endpoint_id),provider:input.provider,mode:input.mode},{eventKey:String(row.event_key),eventType:String(row.event_type),paymentId:String(row.payment_id),amountMinor:Number(row.amount_minor),currency:String(row.currency),paid:true});
 return {id,invoiceId:input.invoiceId};
}

/** The caller holds a signed verified payment callback bound to a service invoice attempt. */
async function settleVerifiedServiceInvoice(db:PoolConnection,endpoint:Endpoint,event:VerifiedPaymentWebhook,attempt:RowDataPacket){
 const [invoices]=await db.execute<RowDataPacket[]>("SELECT id,name,status,branch_id,data FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='customer_invoice' AND archived=FALSE FOR UPDATE",[attempt.invoice_id,endpoint.tenant_id]);
 const invoice=invoices[0];
 if(!invoice||invoice.branch_id!==attempt.branch_id||endpoint.scope_key!=="tenant"&&invoice.branch_id!==endpoint.scope_key)return "scope_mismatch";
 const data=typeof invoice.data==="string"?JSON.parse(invoice.data):invoice.data;
 if(!data||typeof data.serviceOrderId!=="string"||data.orderId)return "review_required";
 const [services]=await db.execute<RowDataPacket[]>("SELECT status,branch_id,data FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='service_order' AND archived=FALSE FOR UPDATE",[data.serviceOrderId,endpoint.tenant_id]);
 const service=services[0];
 if(!service||service.status!=="completed"||service.branch_id&&service.branch_id!==invoice.branch_id)return "review_required";
 const serviceData=typeof service.data==="string"?JSON.parse(service.data):service.data;
 const precision=10**currencyDecimals(String(attempt.currency));
 const parts=[data.subtotal,data.taxAmount??0,data.serviceFee??0].map(Number);
 if(parts.some(v=>!Number.isFinite(v)||v<0||Math.abs(v*precision-Math.round(v*precision))>0.000001))return "amount_mismatch";
 const minor=parts.reduce((sum,v)=>sum+Math.round(v*precision),0);
 if(minor!==event.amountMinor||minor!==Number(attempt.amount_minor)||attempt.currency!==event.currency||majorToMinor(String(serviceData.amount),String(attempt.currency))!==minor)return "amount_mismatch";
 if(invoice.status!=="issued")return invoice.status==="paid"?"already_paid":"review_required";
 if(endpoint.mode==="test"){
  await db.execute("UPDATE tenant_service_invoice_payment_attempts SET status='test_completed' WHERE id=? AND tenant_id=? AND status='pending'",[attempt.id,endpoint.tenant_id]);
  return "test_received";
 }
 const [proofs]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND kind='invoice_settlement' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.invoiceId'))=? LIMIT 1 FOR UPDATE",[endpoint.tenant_id,attempt.invoice_id]);
 if(proofs.length)return "already_paid";
 const lookupKey=createHash("sha256").update(JSON.stringify(["verified_gateway",endpoint.provider,endpoint.mode,event.paymentId])).digest("hex");
 const [reused]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND kind='invoice_settlement' AND lookup_key=? LIMIT 1 FOR UPDATE",[endpoint.tenant_id,lookupKey]);
 if(reused.length)return "review_required";
 const proof={invoiceId:String(invoice.id),serviceOrderId:data.serviceOrderId,source:"provider_verified_webhook",provider:endpoint.provider,mode:endpoint.mode,providerPaymentId:event.paymentId,eventKey:event.eventKey,amountMinor:event.amountMinor,currency:event.currency,confirmedAt:new Date().toISOString()};
 await db.execute("INSERT INTO restaurant_resources(id,tenant_id,branch_id,kind,name,status,data,lookup_key) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),endpoint.tenant_id,invoice.branch_id,"invoice_settlement","Verified service payment: "+String(invoice.name),"confirmed",JSON.stringify(proof),lookupKey]);
 await db.execute("UPDATE restaurant_resources SET status='paid',version=version+1 WHERE id=? AND tenant_id=? AND kind='customer_invoice' AND status='issued'",[invoice.id,endpoint.tenant_id]);
 await db.execute("UPDATE tenant_service_invoice_payment_attempts SET status='paid' WHERE id=? AND tenant_id=?",[attempt.id,endpoint.tenant_id]);
 return "service_invoice_paid";
}

/** A signed live callback may settle a previously ISSUED generic order invoice.
 * Do not issue a draft, overwrite a manually paid invoice or infer payment from
 * callback metadata. The order is already locked and matched to a server-created
 * provider attempt before this function is called.
 */
async function settleIssuedOrderInvoice(
 db:PoolConnection,endpoint:Endpoint,event:VerifiedPaymentWebhook,
 orderId:string,orderBranch:string,currency:string
){
 const [invoices]=await db.execute<RowDataPacket[]>("SELECT id,name,status,branch_id,data FROM restaurant_resources WHERE tenant_id=? AND kind='customer_invoice' AND archived=FALSE AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.orderId'))=? FOR UPDATE",[endpoint.tenant_id,orderId]);
 if(!invoices.length)return;
 // Unexpected duplicate invoices must not create duplicate receipts.
 if(invoices.length!==1)return;
 const invoice=invoices[0];
 if(invoice.status!=="issued"||invoice.branch_id&&String(invoice.branch_id)!==orderBranch)return;
 const data=typeof invoice.data==="string"?JSON.parse(invoice.data):invoice.data;
 if(!data||typeof data!=="object"||data.serviceOrderId)return;
 const precision=10**currencyDecimals(currency);
 const parts=[data.subtotal,data.taxAmount??0,data.serviceFee??0].map(Number);
 if(parts.some(value=>!Number.isFinite(value)||value<0||Math.abs(value*precision-Math.round(value*precision))>0.000001))return;
 const invoiceMinor=parts.reduce((total,value)=>total+Math.round(value*precision),0);
 if(!Number.isSafeInteger(invoiceMinor)||invoiceMinor!==event.amountMinor)return;
 const [prior]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND kind='invoice_settlement' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.invoiceId'))=? LIMIT 1 FOR UPDATE",[endpoint.tenant_id,invoice.id]);
 if(prior.length)return; // Other evidence, including a manual receipt, must not be overwritten.
 const paymentKey=createHash("sha256").update(JSON.stringify(["verified_gateway",endpoint.provider,endpoint.mode,event.paymentId])).digest("hex");
 const [reused]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND kind='invoice_settlement' AND lookup_key=? LIMIT 1 FOR UPDATE",[endpoint.tenant_id,paymentKey]);
 if(reused.length)return;
 const settlementId=randomUUID(),proof={invoiceId:String(invoice.id),orderId,source:"provider_verified_webhook",provider:endpoint.provider,mode:endpoint.mode,providerPaymentId:event.paymentId,eventKey:event.eventKey,amountMinor:event.amountMinor,currency,confirmedAt:new Date().toISOString()};
 await db.execute("INSERT INTO restaurant_resources(id,tenant_id,branch_id,kind,name,status,data,lookup_key) VALUES (?,?,?,?,?,?,?,?)",[settlementId,endpoint.tenant_id,invoice.branch_id??orderBranch,"invoice_settlement","Verified gateway payment: "+String(invoice.name),"confirmed",JSON.stringify(proof),paymentKey]);
 await db.execute("UPDATE restaurant_resources SET status='paid',version=version+1 WHERE tenant_id=? AND id=? AND kind='customer_invoice' AND status='issued'",[endpoint.tenant_id,invoice.id]);
}

/** Catch up a late-issued invoice using ONLY an already settled live attempt
 * and its authenticated receipt. Called in a NEW transaction after the invoice
 * mutation commits, to follow the same order -> invoice lock ordering as webhooks.
 * A merchant's paid flag alone is never trusted.
 */
export async function reconcileLateIssuedInvoice(db:PoolConnection,tenantId:string,invoiceId:string){
 const [preview]=await db.execute<RowDataPacket[]>("SELECT status,data FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='customer_invoice' AND archived=FALSE LIMIT 1",[invoiceId,tenantId]);
 if(preview[0]?.status!=="issued")return {status:"not_applicable" as const};
 const details=typeof preview[0].data==="string"?JSON.parse(preview[0].data):preview[0].data;
 if(!details||typeof details.orderId!=="string"||details.serviceOrderId)return {status:"not_applicable" as const};
 const orderId=details.orderId;
 // The webhook also locks the order first, then its invoice.
 const [orders]=await db.execute<RowDataPacket[]>("SELECT branch_id,total,currency,status,payment_status FROM restaurant_orders WHERE id=? AND tenant_id=? FOR UPDATE",[orderId,tenantId]);
 const order=orders[0];
 if(!order||order.payment_status!=="paid"||["cancelled","refunded","rejected"].includes(String(order.status)))return {status:"not_applicable" as const};
 const [invoices]=await db.execute<RowDataPacket[]>("SELECT status,branch_id,data FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='customer_invoice' AND archived=FALSE FOR UPDATE",[invoiceId,tenantId]);
 const invoice=invoices[0];
 if(!invoice||invoice.status!=="issued")return {status:"not_applicable" as const};
 const current=typeof invoice.data==="string"?JSON.parse(invoice.data):invoice.data;
 if(current?.orderId!==orderId||current.serviceOrderId||invoice.branch_id&&String(invoice.branch_id)!==String(order.branch_id))return {status:"not_applicable" as const};
 const [attempts]=await db.execute<RowDataPacket[]>("SELECT scope_key,provider,mode,provider_payment_id,amount_minor,currency FROM tenant_payment_attempts WHERE tenant_id=? AND order_id=? AND mode='live' AND status='paid' LIMIT 2",[tenantId,orderId]);
 if(attempts.length!==1)return {status:"not_applicable" as const};
 const attempt=attempts[0];
 const total=majorToMinor(String(order.total),String(order.currency));
 if(attempt.currency!==order.currency||Number(attempt.amount_minor)!==total||attempt.scope_key!=="tenant"&&attempt.scope_key!==order.branch_id)return {status:"not_applicable" as const};
 const [receipts]=await db.execute<RowDataPacket[]>("SELECT endpoint_id,event_key,amount_minor,currency,event_type FROM tenant_payment_webhook_receipts WHERE tenant_id=? AND scope_key=? AND provider=? AND mode='live' AND BINARY payment_id=BINARY ? AND status='paid' ORDER BY sequence_id LIMIT 1",[tenantId,attempt.scope_key,attempt.provider,attempt.provider_payment_id]);
 const receipt=receipts[0];
 if(!receipt||Number(receipt.amount_minor)!==total||receipt.currency!==order.currency)return {status:"not_applicable" as const};
 await settleIssuedOrderInvoice(db,{
  tenant_id:tenantId,scope_key:String(attempt.scope_key),endpoint_id:String(receipt.endpoint_id),provider:String(attempt.provider),mode:"live"
 },{
  eventKey:String(receipt.event_key),eventType:String(receipt.event_type),paymentId:String(attempt.provider_payment_id),
  amountMinor:total,currency:String(order.currency),paid:true
 },orderId,String(order.branch_id),String(order.currency));
 const [after]=await db.execute<RowDataPacket[]>("SELECT status FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='customer_invoice'",[invoiceId,tenantId]);
 return {status:after[0]?.status==="paid"?"reconciled" as const:"not_applicable" as const};
}

export async function persistPaymentWebhook(db:PoolConnection,endpoint:Endpoint,event:VerifiedPaymentWebhook){
 // Caller holds the endpoint lock and commits only after this function persists the receipt.
 const [existing]=await db.execute<RowDataPacket[]>("SELECT id,status FROM tenant_payment_webhook_receipts WHERE endpoint_id=? AND event_key=?",[endpoint.endpoint_id,event.eventKey]);
 if(existing.length&&!["unmatched","test_received"].includes(String(existing[0].status)))return {duplicate:true,status:String(existing[0].status)};
 let status=event.paid?"unmatched":"ignored";
 if(event.paid&&endpoint.mode==="test")status="test_received";
 if(event.paid){
  const [attempts]=await db.execute<RowDataPacket[]>("SELECT id,order_id,branch_id,amount_minor,currency,status FROM tenant_payment_attempts WHERE tenant_id=? AND scope_key=? AND provider=? AND mode=? AND provider_payment_id=? FOR UPDATE",[endpoint.tenant_id,endpoint.scope_key,endpoint.provider,endpoint.mode,event.paymentId]);
  const attempt=attempts[0];
  if(attempt){
   const [orders]=await db.execute<RowDataPacket[]>("SELECT branch_id,total,currency,status,payment_status FROM restaurant_orders WHERE tenant_id=? AND id=? FOR UPDATE",[endpoint.tenant_id,attempt.order_id]);
   const order=orders[0];
   if(!order||order.branch_id!==attempt.branch_id||endpoint.scope_key!=="tenant"&&order.branch_id!==endpoint.scope_key)status="scope_mismatch";
   else if(Number(attempt.amount_minor)!==event.amountMinor||attempt.currency!==event.currency||order.currency!==event.currency||majorToMinor(String(order.total),String(order.currency))!==event.amountMinor)status="amount_mismatch";
   else if(order.status==="cancelled"||order.payment_status==="refunded")status="review_required";
   else if(endpoint.mode==="test"){
    // Finish the sandbox attempt without changing the real order or its version.
    await db.execute("UPDATE tenant_payment_attempts SET status='test_completed' WHERE tenant_id=? AND id=? AND mode='test' AND status='pending'",[endpoint.tenant_id,attempt.id]);
    status="test_received";
   }
   else if(order.payment_status==="paid")status="already_paid";
   else{
    await db.execute("UPDATE restaurant_orders SET payment_status='paid',version=version+1 WHERE tenant_id=? AND id=? AND payment_status='unpaid'",[endpoint.tenant_id,attempt.order_id]);
    await db.execute("UPDATE tenant_payment_attempts SET status='paid' WHERE tenant_id=? AND id=?",[endpoint.tenant_id,attempt.id]);
    await settleIssuedOrderInvoice(db,endpoint,event,String(attempt.order_id),String(order.branch_id),String(order.currency));
    status="paid";
   }
  }
  if(!attempt){
   const [serviceAttempts]=await db.execute<RowDataPacket[]>("SELECT id,invoice_id,branch_id,scope_key,amount_minor,currency,status FROM tenant_service_invoice_payment_attempts WHERE tenant_id=? AND scope_key=? AND provider=? AND mode=? AND BINARY provider_payment_id=BINARY ? FOR UPDATE",[endpoint.tenant_id,endpoint.scope_key,endpoint.provider,endpoint.mode,event.paymentId]);
   const serviceAttempt=serviceAttempts[0];
   if(serviceAttempt){
    if(Number(serviceAttempt.amount_minor)!==event.amountMinor||serviceAttempt.currency!==event.currency)status="amount_mismatch";
    else if(serviceAttempt.status==="paid")status="already_paid";
    else if(serviceAttempt.status==="test_completed")status="test_received";
    else if(serviceAttempt.status!=="pending")status="review_required";
    else status=await settleVerifiedServiceInvoice(db,endpoint,event,serviceAttempt);
   }
  }
 }
 if(existing.length){await db.execute("UPDATE tenant_payment_webhook_receipts SET status=? WHERE id=? AND tenant_id=?",[status,existing[0].id,endpoint.tenant_id]);return {duplicate:true,status};}
 await db.execute("INSERT INTO tenant_payment_webhook_receipts(id,tenant_id,scope_key,endpoint_id,provider,mode,event_key,payment_id,event_type,amount_minor,currency,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",[randomUUID(),endpoint.tenant_id,endpoint.scope_key,endpoint.endpoint_id,endpoint.provider,endpoint.mode,event.eventKey,event.paymentId,event.eventType,event.amountMinor,event.currency,status]);
 return {duplicate:false,status};
}

