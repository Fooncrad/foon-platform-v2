import {createHash,randomUUID} from "node:crypto";
import type {Pool,PoolConnection,RowDataPacket} from "mysql2/promise";
import {CheckoutError} from "./customer-checkout.ts";
import {decryptPaymentCredentials} from "./credential-vault.mjs";
import {createTapHostedCheckout,type TapCheckoutInput} from "./tap-hosted-checkout.mjs";
import {majorToMinor,currencyDecimals} from "./webhook-verification.mjs";
import {registerServiceInvoicePaymentAttempt} from "./webhook-settlement.ts";

function refuse(code:string,status=409):never{throw new CheckoutError(code,status);}
function secureOrigin(value:string){
 try{const url=new URL(value);if(url.protocol!=="https:"||url.username||url.password||url.port)refuse("CHECKOUT_HTTPS_REQUIRED",503);return url.origin;}catch{refuse("CHECKOUT_HTTPS_REQUIRED",503);}
}
function parse(data:unknown):Record<string,unknown>{return typeof data==="string"?JSON.parse(data):data as Record<string,unknown>;}
async function invoiceSnapshot(db:PoolConnection,tenantId:string,invoiceId:string,lock:boolean){
 const [rows]=await db.execute<RowDataPacket[]>("SELECT r.id,r.branch_id,r.status,r.data,r.name FROM restaurant_resources r JOIN tenants t ON t.id=r.tenant_id AND t.status='active' WHERE r.tenant_id=? AND r.id=? AND r.kind='customer_invoice' AND r.archived=FALSE"+(lock?" FOR UPDATE":""),[tenantId,invoiceId]);
 const invoice=rows[0];
 if(!invoice||invoice.status!=="issued")refuse("SERVICE_INVOICE_NOT_ISSUED",404);
 const data=parse(invoice.data);
 if(typeof data.serviceOrderId!=="string"||data.orderId)refuse("SERVICE_INVOICE_REQUIRED",400);
 return {...invoice,data};
}
async function paymentScope(db:PoolConnection,tenantId:string,branchId:string|null){
 const [rows]=await db.execute<RowDataPacket[]>("SELECT s.scope_key,s.provider,s.enabled,s.currency,g.mode,g.credentials_ciphertext,e.endpoint_id FROM tenant_payment_settings s JOIN tenant_payment_gateway_credentials g ON g.tenant_id=s.tenant_id AND g.scope_key=s.scope_key AND g.provider=s.provider LEFT JOIN tenant_payment_webhook_endpoints e ON e.tenant_id=s.tenant_id AND e.scope_key=s.scope_key AND e.provider=s.provider AND e.mode=g.mode WHERE s.tenant_id=? AND s.scope_key IN ('tenant',?) ORDER BY s.scope_key FOR UPDATE",[tenantId,branchId??"tenant"]);
 const cfg=rows.find(r=>r.scope_key===branchId)??rows.find(r=>r.scope_key==="tenant");
 if(!cfg||!cfg.enabled||cfg.provider!=="tap"||cfg.mode!=="test"||!cfg.credentials_ciphertext||!cfg.endpoint_id)refuse("CHECKOUT_NOT_ENABLED");
 return cfg;
}
function invoiceMinor(invoice:RowDataPacket,serviceData:Record<string,unknown>,currency:string){
 const precision=10**currencyDecimals(currency);
 const values=[invoice.data.subtotal,invoice.data.taxAmount??0,invoice.data.serviceFee??0].map(Number);
 if(values.some(v=>!Number.isFinite(v)||v<0||Math.abs(v*precision-Math.round(v*precision))>0.000001))refuse("CHECKOUT_AMOUNT_INVALID",400);
 // The provider checkout adapter requires the verified total, not merchant/browser amounts.
 const amountMinor=values.reduce((sum,v)=>sum+Math.round(v*precision),0);
 if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>9999999999||amountMinor!==majorToMinor(String(serviceData.amount),currency))refuse("CHECKOUT_AMOUNT_INVALID",400);
 return amountMinor;
}
type Input={tenantId:string;userId:string;invoiceId:string;customerEmail:string;appUrl:string};
export async function startServiceInvoiceSandboxCheckout(pool:Pool,input:Input,fetcher?:typeof fetch){
 const origin=secureOrigin(input.appUrl);
 if(typeof input.customerEmail!=="string"||input.customerEmail.length>254||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(input.customerEmail))refuse("CHECKOUT_CUSTOMER_EMAIL_REQUIRED",400);
 let request:TapCheckoutInput|undefined;
 let checkoutId="",scope="",amountMinor=0,currency="",branchId:string|null=null,payloadHash="";
 const db=await pool.getConnection();
 try{
  await db.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
  await db.beginTransaction();
  const preview=await invoiceSnapshot(db,input.tenantId,input.invoiceId,false);
  branchId=preview.branch_id?String(preview.branch_id):null;
  const setting=await paymentScope(db,input.tenantId,branchId);
  const invoice=await invoiceSnapshot(db,input.tenantId,input.invoiceId,true);
  if((invoice.branch_id?String(invoice.branch_id):null)!==branchId)refuse("CHECKOUT_REVIEW_REQUIRED");
  const [serviceRows]=await db.execute<RowDataPacket[]>("SELECT status,branch_id,data FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='service_order' AND archived=FALSE FOR UPDATE",[invoice.data.serviceOrderId,input.tenantId]);
  const service=serviceRows[0];
  if(!service||service.status!=="completed"||service.branch_id&&String(service.branch_id)!==branchId)refuse("SERVICE_NOT_COMPLETED");
  const [proof]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND kind='invoice_settlement' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.invoiceId'))=? LIMIT 1 FOR UPDATE",[input.tenantId,input.invoiceId]);
  if(proof.length)refuse("INVOICE_ALREADY_SETTLED");
  scope=String(setting.scope_key);currency=String(setting.currency);
  amountMinor=invoiceMinor(invoice,parse(service.data),currency);
  const credentials=decryptPaymentCredentials(String(setting.credentials_ciphertext),{tenantId:input.tenantId,scope,provider:"tap",mode:"test"});
  if(typeof credentials.secret_key!=="string"||!credentials.secret_key.startsWith("sk_test_")||/[\\r\\n]/.test(credentials.secret_key))refuse("PAYMENT_SETUP_INCOMPLETE");
  const [existing]=await db.execute<RowDataPacket[]>("SELECT *,TIMESTAMPDIFF(SECOND,created_at,NOW()) AS age_seconds FROM tenant_service_invoice_checkouts WHERE tenant_id=? AND invoice_id=? AND mode='test' FOR UPDATE",[input.tenantId,input.invoiceId]);
  const checkout=existing[0];checkoutId=checkout?String(checkout.id):randomUUID();
  const customerName=String(parse(service.data).customerName??"").trim();
  if(!customerName||customerName.length>100)refuse("CHECKOUT_CUSTOMER_REQUIRED",400);
  request={mode:"test",secretKey:credentials.secret_key,amountMinor,currency,orderReference:input.invoiceId,idempotencyKey:checkoutId,webhookUrl:origin+"/api/payments/webhooks/"+setting.endpoint_id,returnUrl:origin+"/customer?payment_return=1",customer:{name:customerName,email:input.customerEmail}};
  const {secretKey:_secret,...publicRequest}=request;void _secret;
  payloadHash=createHash("sha256").update(JSON.stringify(publicRequest)).digest("hex");
  if(checkout){
   if(checkout.scope_key!==scope||checkout.branch_id!==branchId||Number(checkout.amount_minor)!==amountMinor||checkout.currency!==currency||checkout.payload_hash!==payloadHash||checkout.state==="review")refuse("CHECKOUT_REVIEW_REQUIRED");
   if(checkout.state==="ready"){
    const [attempts]=await db.execute<RowDataPacket[]>("SELECT status FROM tenant_service_invoice_payment_attempts WHERE tenant_id=? AND invoice_id=? AND mode='test' AND BINARY provider_payment_id=BINARY ? LIMIT 1",[input.tenantId,input.invoiceId,checkout.provider_payment_id]);
    if(attempts[0]?.status==="test_completed"){await db.commit();return {state:"test_completed" as const,mode:"test" as const};}
    if(!attempts.length||!checkout.hosted_url||Number(checkout.age_seconds)>1800)refuse("CHECKOUT_REVIEW_REQUIRED");
    await db.commit();return {state:"ready" as const,mode:"test" as const,url:String(checkout.hosted_url)};
   }
   // A second request must never repeat an uncertain or in-flight gateway POST.
   if(checkout.state==="creating")refuse("CHECKOUT_IN_PROGRESS",409);
   refuse("CHECKOUT_REVIEW_REQUIRED",409);
  }
  const [attempts]=await db.execute<RowDataPacket[]>("SELECT id FROM tenant_service_invoice_payment_attempts WHERE tenant_id=? AND invoice_id=? LIMIT 1 FOR UPDATE",[input.tenantId,input.invoiceId]);
  if(attempts.length)refuse("PAYMENT_ATTEMPTS_PENDING");
  await db.execute("INSERT INTO tenant_service_invoice_checkouts(id,tenant_id,scope_key,invoice_id,branch_id,requested_by,provider,mode,amount_minor,currency,payload_hash) VALUES (?,?,?,?,?,?,'tap','test',?,?,?)",[checkoutId,input.tenantId,scope,input.invoiceId,branchId,input.userId,amountMinor,currency,payloadHash]);
  await db.commit();
 }catch(error){await db.rollback();throw error;}finally{db.release();}
 let created:{paymentId:string;url:string};
 try{created=await createTapHostedCheckout(request!,fetcher);}
 catch{
  await pool.execute("UPDATE tenant_service_invoice_checkouts SET state='uncertain' WHERE tenant_id=? AND id=? AND state='creating'",[input.tenantId,checkoutId]);
  refuse("CHECKOUT_UNCERTAIN",503);
 }
 const finish=await pool.getConnection();
 try{
  await finish.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
  await finish.beginTransaction();
  const [settings]=await finish.execute<RowDataPacket[]>("SELECT provider,mode FROM tenant_payment_gateway_credentials WHERE tenant_id=? AND scope_key=? FOR UPDATE",[input.tenantId,scope]);
  const invoice=await invoiceSnapshot(finish,input.tenantId,input.invoiceId,true);
  const [checkouts]=await finish.execute<RowDataPacket[]>("SELECT * FROM tenant_service_invoice_checkouts WHERE tenant_id=? AND id=? FOR UPDATE",[input.tenantId,checkoutId]);
  const record=checkouts[0];
  if(!record||settings[0]?.provider!=="tap"||settings[0]?.mode!=="test"||invoice.branch_id!==branchId||record.scope_key!==scope||record.payload_hash!==payloadHash||record.state!=="creating"||record.provider_payment_id&&record.provider_payment_id!==created.paymentId){
   await finish.execute("UPDATE tenant_service_invoice_checkouts SET state='review',provider_payment_id=COALESCE(provider_payment_id,?) WHERE tenant_id=? AND id=?",[created.paymentId,input.tenantId,checkoutId]);
   await finish.commit();refuse("CHECKOUT_REVIEW_REQUIRED");
  }
  // The trusted Tap adapter produced this payment ID, never the merchant/browser.
  const [attempt]=await finish.execute<RowDataPacket[]>("SELECT status FROM tenant_service_invoice_payment_attempts WHERE tenant_id=? AND invoice_id=? AND BINARY provider_payment_id=BINARY ?",[input.tenantId,input.invoiceId,created.paymentId]);
  if(!attempt.length)await registerServiceInvoicePaymentAttempt(finish,{tenantId:input.tenantId,scope,invoiceId:input.invoiceId,provider:"tap",mode:"test",paymentId:created.paymentId});
  await finish.execute("UPDATE tenant_service_invoice_checkouts SET state='ready',provider_payment_id=?,hosted_url=? WHERE tenant_id=? AND id=?",[created.paymentId,created.url,input.tenantId,checkoutId]);
  const [after]=await finish.execute<RowDataPacket[]>("SELECT status FROM tenant_service_invoice_payment_attempts WHERE tenant_id=? AND invoice_id=? AND BINARY provider_payment_id=BINARY ?",[input.tenantId,input.invoiceId,created.paymentId]);
  await finish.commit();
  return after[0]?.status==="test_completed"?{state:"test_completed" as const,mode:"test" as const}:{state:"ready" as const,mode:"test" as const,url:created.url};
 }catch(error){await finish.rollback();throw error;}finally{finish.release();}
}
