import {createHash,randomUUID} from "node:crypto";
import type {Pool,PoolConnection,RowDataPacket} from "mysql2/promise";
import {decryptPaymentCredentials} from "./credential-vault.mjs";
import {createTapHostedCheckout,type TapCheckoutInput} from "./tap-hosted-checkout.mjs";
import {majorToMinor} from "./webhook-verification.mjs";
import {registerPaymentAttempt} from "./webhook-settlement.ts";

export class CheckoutError extends Error {
 status:number;
 constructor(code:string,status=409){super(code);this.status=status;}
}
function fail(code:string,status=409):never{throw new CheckoutError(code,status);}
function appOrigin(value:string){
 try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password)fail("CHECKOUT_HTTPS_REQUIRED",503);return u.origin;}catch{fail("CHECKOUT_HTTPS_REQUIRED",503);}
}
async function ownedOrder(db:PoolConnection,user:string,orderId:string,lock=false){
 const [rows]=await db.execute<RowDataPacket[]>("SELECT o.*,u.display_name,u.email FROM restaurant_orders o JOIN tenants t ON t.id=o.tenant_id AND t.status='active' JOIN branches b ON b.id=o.branch_id AND b.tenant_id=o.tenant_id AND b.enabled=TRUE JOIN users u ON u.id=o.customer_user_id AND u.status='active' JOIN tenant_customers c ON c.tenant_id=o.tenant_id AND c.user_id=u.id WHERE o.id=? AND o.customer_user_id=?"+(lock?" FOR UPDATE":""),[orderId,user]);
 if(!rows[0])fail("ORDER_NOT_FOUND",404);
 return rows[0];
}
function payable(order:RowDataPacket){
 if(order.payment_status!=="unpaid"||["cancelled","rejected","refunded"].includes(String(order.status)))fail("ORDER_NOT_PAYABLE");
}
async function config(db:PoolConnection,order:RowDataPacket){
 // A saved branch override is explicit: disabled overrides never fall back.
 const [rows]=await db.execute<RowDataPacket[]>("SELECT s.scope_key,s.provider,s.enabled,s.currency,g.mode,g.credentials_ciphertext,e.endpoint_id FROM tenant_payment_settings s LEFT JOIN tenant_payment_gateway_credentials g ON g.tenant_id=s.tenant_id AND g.scope_key=s.scope_key LEFT JOIN tenant_payment_webhook_endpoints e ON e.tenant_id=s.tenant_id AND e.scope_key=s.scope_key AND e.provider=s.provider AND e.mode=g.mode WHERE s.tenant_id=? AND s.scope_key IN ('tenant',?) ORDER BY s.scope_key FOR UPDATE",[order.tenant_id,order.branch_id]);
 const setting=rows.find(r=>r.scope_key===order.branch_id)??rows.find(r=>r.scope_key==="tenant");
 if(!setting||!setting.enabled||setting.provider!=="tap"||setting.mode!=="test"||!setting.endpoint_id||!setting.credentials_ciphertext)fail("CHECKOUT_NOT_ENABLED");
 if(setting.currency!==order.currency)fail("CHECKOUT_CURRENCY_MISMATCH");
 return setting;
}
export async function startCustomerPayment(pool:Pool,input:{userId:string;orderId:string;appUrl:string},fetcher?:typeof fetch){
 const origin=appOrigin(input.appUrl),db=await pool.getConnection();
 let gatewayInput:TapCheckoutInput;
 let checkoutId="",tenantId="",scope="";
 try{
  await db.beginTransaction();
  const candidate=await ownedOrder(db,input.userId,input.orderId);
  const setting=await config(db,candidate);
  const order=await ownedOrder(db,input.userId,input.orderId,true);payable(order);
  if(order.tenant_id!==candidate.tenant_id||order.branch_id!==candidate.branch_id)fail("ORDER_CHANGED");
  // Authorization is checked again for every retry; staff membership is irrelevant.
  const [grants]=await db.execute<RowDataPacket[]>("SELECT p.code,pf.enabled FROM tenant_subscriptions s JOIN package_plans p ON p.id=s.plan_id AND p.enabled=TRUE JOIN package_features f ON f.feature_key='orders' LEFT JOIN package_plan_features pf ON pf.plan_id=p.id AND pf.feature_key=f.feature_key WHERE s.tenant_id=? AND s.status='active' AND (s.starts_at IS NULL OR s.starts_at<=NOW()) AND (s.ends_at IS NULL OR s.ends_at>NOW()) LIMIT 1",[order.tenant_id]);
  if(!grants[0]||!(grants[0].enabled===null?grants[0].code==="enterprise":Boolean(grants[0].enabled)))fail("PLAN_FEATURE_REQUIRED",403);
  tenantId=String(order.tenant_id);scope=String(setting.scope_key);
  const credentials=decryptPaymentCredentials(String(setting.credentials_ciphertext),{tenantId,scope,provider:"tap",mode:"test"});
  const [existing]=await db.execute<RowDataPacket[]>("SELECT *,TIMESTAMPDIFF(SECOND,created_at,NOW()) AS age_seconds FROM tenant_payment_checkouts WHERE tenant_id=? AND order_id=? AND mode='test' FOR UPDATE",[tenantId,input.orderId]);
  const checkout=existing[0];checkoutId=checkout?String(checkout.id):randomUUID();
  const amountMinor=majorToMinor(String(order.total),String(order.currency));
  const name=String(order.display_name??"").trim(),email=String(order.email);
  if(!name||name.length>100||!/^\S+@\S+\.\S+$/.test(email))fail("CHECKOUT_PROFILE_REQUIRED",400);
  gatewayInput={mode:"test",secretKey:credentials.secret_key,amountMinor,currency:String(order.currency),orderReference:input.orderId,idempotencyKey:checkoutId,webhookUrl:origin+"/api/payments/webhooks/"+setting.endpoint_id,returnUrl:origin+"/customer?payment_return=1",customer:{name,email}};
  const {secretKey:ignored,...snapshot}=gatewayInput;void ignored;
  const payloadHash=createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  if(checkout){
   if(checkout.scope_key!==scope||checkout.customer_user_id!==input.userId||checkout.payload_hash!==payloadHash||checkout.state==="review")fail("CHECKOUT_REVIEW_REQUIRED");
   if(checkout.state==="ready"){
    const [attempt]=await db.execute<RowDataPacket[]>("SELECT status FROM tenant_payment_attempts WHERE tenant_id=? AND provider='tap' AND mode='test' AND provider_payment_id=?",[tenantId,checkout.provider_payment_id]);
    if(attempt[0]?.status==="test_completed"){await db.commit();return {state:"test_completed" as const,mode:"test" as const};}
    if(Number(checkout.age_seconds)>1800)fail("CHECKOUT_REVIEW_REQUIRED");
    if(!attempt[0]||!checkout.hosted_url)fail("CHECKOUT_REVIEW_REQUIRED");
    await db.commit();return {state:"ready" as const,mode:"test" as const,url:String(checkout.hosted_url)};
   }
   // Never retry ambiguous creation indefinitely after provider idempotency might expire.
   if(Number(checkout.age_seconds)>900)fail("CHECKOUT_REVIEW_REQUIRED");
  }else{
   const [pending]=await db.execute<RowDataPacket[]>("SELECT id FROM tenant_payment_attempts WHERE tenant_id=? AND order_id=? AND status='pending' LIMIT 1 FOR UPDATE",[tenantId,input.orderId]);
   if(pending.length)fail("PAYMENT_ATTEMPTS_PENDING");
   await db.execute("INSERT INTO tenant_payment_checkouts(id,tenant_id,scope_key,order_id,branch_id,customer_user_id,provider,mode,amount_minor,currency,payload_hash) VALUES (?,?,?,?,?,?,'tap','test',?,?,?)",[checkoutId,tenantId,scope,input.orderId,order.branch_id,input.userId,amountMinor,order.currency,payloadHash]);
  }
  await db.commit();
 }catch(error){await db.rollback();throw error;}finally{db.release();}
 // The durable ID exists before the HTTP request. Concurrent calls use the same provider key.
 let created;
 try{created=await createTapHostedCheckout(gatewayInput!,fetcher);}
 catch{
  await pool.execute("UPDATE tenant_payment_checkouts SET state='uncertain' WHERE tenant_id=? AND id=? AND state='creating'",[tenantId,checkoutId]);
  fail("CHECKOUT_UNCERTAIN",503);
 }
 const finish=await pool.getConnection();
 try{
  await finish.beginTransaction();
  const [settings]=await finish.execute<RowDataPacket[]>("SELECT provider,mode FROM tenant_payment_gateway_credentials WHERE tenant_id=? AND scope_key=? FOR UPDATE",[tenantId,scope]);
  const order=await ownedOrder(finish,input.userId,input.orderId,true);
  const [records]=await finish.execute<RowDataPacket[]>("SELECT * FROM tenant_payment_checkouts WHERE tenant_id=? AND id=? FOR UPDATE",[tenantId,checkoutId]);
  const record=records[0];
  if(!record||record.scope_key!==scope||settings[0]?.provider!=="tap"||settings[0]?.mode!=="test"||order.branch_id!==record.branch_id||majorToMinor(String(order.total),String(order.currency))!==Number(record.amount_minor)||order.currency!==record.currency||order.payment_status!=="unpaid"||["cancelled","rejected","refunded"].includes(String(order.status))||record.provider_payment_id&&record.provider_payment_id!==created.paymentId){
   await finish.execute("UPDATE tenant_payment_checkouts SET state='review',provider_payment_id=COALESCE(provider_payment_id,?) WHERE tenant_id=? AND id=?",[created.paymentId,tenantId,checkoutId]);await finish.commit();fail("CHECKOUT_REVIEW_REQUIRED");
  }
  const [attempts]=await finish.execute<RowDataPacket[]>("SELECT order_id,scope_key,status FROM tenant_payment_attempts WHERE tenant_id=? AND provider='tap' AND mode='test' AND provider_payment_id=? FOR UPDATE",[tenantId,created.paymentId]);
  if(attempts[0]&&(attempts[0].order_id!==input.orderId||attempts[0].scope_key!==scope))fail("CHECKOUT_REVIEW_REQUIRED");
  if(!attempts.length)await registerPaymentAttempt(finish,{tenantId,scope,orderId:input.orderId,provider:"tap",mode:"test",paymentId:created.paymentId});
  await finish.execute("UPDATE tenant_payment_checkouts SET state='ready',provider_payment_id=?,hosted_url=? WHERE tenant_id=? AND id=?",[created.paymentId,created.url,tenantId,checkoutId]);
  const [status]=await finish.execute<RowDataPacket[]>("SELECT status FROM tenant_payment_attempts WHERE tenant_id=? AND provider='tap' AND mode='test' AND provider_payment_id=?",[tenantId,created.paymentId]);
  await finish.commit();
  return status[0]?.status==="test_completed"?{state:"test_completed" as const,mode:"test" as const}:{state:"ready" as const,mode:"test" as const,url:created.url};
 }catch(error){await finish.rollback();throw error;}finally{finish.release();}
}
