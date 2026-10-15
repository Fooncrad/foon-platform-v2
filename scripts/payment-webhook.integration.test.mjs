import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID,randomBytes,createHmac} from "node:crypto";
import {spawn} from "node:child_process";
import mysql from "mysql2/promise";
import {countryRegions} from "../lib/tenant/country-catalog.ts";
import {registerPaymentAttempt} from "../lib/payments/webhook-settlement.ts";

test("webhook routes verify signatures, settle mapped live orders exactly once and expose scoped metadata",async()=>{
 const url=new URL(process.env.DATABASE_URL||"");assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/foon_migration_test");
 const db=await mysql.createConnection(url.href),origin="http://127.0.0.1:3120",vault=randomBytes(32).toString("base64");
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3120"],{env:{...process.env,APP_URL:origin,FOON_PAYMENT_VAULT_KEY:vault},stdio:["ignore","pipe","pipe"]});
 let output="";server.stdout.on("data",c=>output+=c);server.stderr.on("data",c=>output+=c);
 try{
  let ready=false;for(let i=0;i<60;i++){try{await fetch(origin+"/login");ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}assert.ok(ready,output);
  async function owner(){const suffix=randomUUID().slice(0,8);const r=await fetch(origin+"/api/auth/register",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({email:"webhook-"+suffix+"@test.example",password:"synthetic-long-password-2026",name:"Webhook owner",storeName:"Webhook "+suffix,slug:"webhook-"+suffix,activity:"grocery",countryCode:"SA",currency:"SAR",region:countryRegions.SA[0]})});assert.equal(r.status,201,await r.clone().text());const data=await r.json();return {tenant:data.tenant.id,cookie:r.headers.get("set-cookie").split(";")[0],user:data.user.id};}
  const account=await owner(),other=await owner();
  const headers={cookie:account.cookie,"x-foon-tenant":account.tenant,origin,"content-type":"application/json"};
  const settings=async()=>{const r=await fetch(origin+"/api/restaurant/payments/settings",{headers});assert.equal(r.status,200);return (await r.json()).settings;};
  const secret="whsec_synthetic",payload={provider:"stripe",mode:"live",branch_id:null,version:null,enabled:false,currency:"SAR",merchant_reference:"",public_key:"pk_live_synthetic",credentials:{secret_key:"sk_live_synthetic",webhook_secret:secret}};
  const configure=async body=>{const r=await fetch(origin+"/api/restaurant/payments/settings",{method:"PUT",headers,body:JSON.stringify(body)});assert.equal(r.status,200,await r.clone().text());};
  await configure(payload);let config=(await settings())[0];assert.ok(config.webhook.url.startsWith(origin+"/api/payments/webhooks/"));const webhook=config.webhook.url;
  await configure({...payload,version:1,credentials:{}});assert.equal((await settings())[0].webhook.url,webhook,"saving credentials must not invalidate dashboard URL");
  const [[branch]]=await db.execute("SELECT id FROM branches WHERE tenant_id=? LIMIT 1",[account.tenant]);
  const [[foreignBranch]]=await db.execute("SELECT id FROM branches WHERE tenant_id=? LIMIT 1",[other.tenant]);
  async function order(tenant=account.tenant,branchId=branch.id,user=account.user,total=12.34){const id=randomUUID();await db.execute("INSERT INTO restaurant_orders(id,tenant_id,branch_id,created_by,channel,status,payment_status,subtotal,discount,total,currency) VALUES (?,?,?,?,'takeaway','new','unpaid',?,0,?,'SAR')",[id,tenant,branchId,user,total,total]);return id;}
  async function invoice(orderId,amount=12.34,status="issued",tenantId=account.tenant,branchId=branch.id){
   const id=randomUUID();
   await db.execute("INSERT INTO restaurant_resources(id,tenant_id,branch_id,kind,name,status,data) VALUES (?,?,?,?,?,?,?)",[id,tenantId,branchId,"customer_invoice","Gateway invoice "+id,status,JSON.stringify({orderId,subtotal:amount,taxAmount:0,serviceFee:0})]);
   return id;
  }
  const invoiceStatus=async id=>(await db.execute("SELECT status,version FROM restaurant_resources WHERE id=?",[id]))[0][0];
  const invoiceReceiptCount=async id=>Number((await db.execute("SELECT COUNT(*) AS n FROM restaurant_resources WHERE tenant_id=? AND kind='invoice_settlement' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.invoiceId'))=?",[account.tenant,id]))[0][0].n);
  async function bind(orderId,paymentId){await db.beginTransaction();try{await registerPaymentAttempt(db,{tenantId:account.tenant,scope:"tenant",orderId,provider:"stripe",mode:"live",paymentId});await db.commit();}catch(e){await db.rollback();throw e;}}
  const paymentStatus=async id=>(await db.execute("SELECT payment_status,version FROM restaurant_orders WHERE id=?",[id]))[0][0];
  function event(eventId,paymentId,amount=1234,live=true){return {id:eventId,type:"payment_intent.succeeded",livemode:live,data:{object:{id:paymentId,object:"payment_intent",status:"succeeded",amount_received:amount,currency:"sar"}}};}
  async function send(e,url=webhook,valid=true){const raw=JSON.stringify(e),timestamp=Math.floor(Date.now()/1000),sig=createHmac("sha256",valid?secret:"wrong-secret").update(timestamp+"."+raw).digest("hex");return fetch(url,{method:"POST",headers:{"content-type":"application/json","stripe-signature":"t="+timestamp+",v1="+sig},body:raw});}
  const main=await order(),mainInvoice=await invoice(main);await bind(main,"pi_live_synthetic");
  const blockedChange=await fetch(origin+"/api/restaurant/payments/settings",{method:"PUT",headers,body:JSON.stringify({...payload,version:2,mode:"test",public_key:"pk_test_synthetic",credentials:{secret_key:"sk_test_synthetic",webhook_secret:secret}})});assert.equal(blockedChange.status,409);assert.equal((await blockedChange.json()).code,"PAYMENT_ATTEMPTS_PENDING");
  assert.equal((await send(event("evt_invalid","pi_live_synthetic"),webhook,false)).status,400);
  assert.equal((await paymentStatus(main)).payment_status,"unpaid");
  assert.equal((await invoiceStatus(mainInvoice)).status,"issued");assert.equal(await invoiceReceiptCount(mainInvoice),0);
  assert.equal((await send(event("evt_case_sensitive","pi_LIVE_synthetic"))).status,200);assert.equal((await paymentStatus(main)).payment_status,"unpaid");
  assert.equal((await send(event("evt_paid","pi_live_synthetic"))).status,200);
  assert.equal((await paymentStatus(main)).payment_status,"paid");const version=(await paymentStatus(main)).version;
  assert.equal((await invoiceStatus(mainInvoice)).status,"paid","an issued order invoice follows the verified live payment");
  const invoiceVersion=(await invoiceStatus(mainInvoice)).version;
  assert.equal(await invoiceReceiptCount(mainInvoice),1);
  const [[proof]]=await db.execute("SELECT data FROM restaurant_resources WHERE tenant_id=? AND kind='invoice_settlement' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.invoiceId'))=?",[account.tenant,mainInvoice]);
  const proofData=typeof proof.data==="string"?JSON.parse(proof.data):proof.data;
  assert.equal(proofData.source,"provider_verified_webhook");assert.equal(proofData.provider,"stripe");
  assert.equal(proofData.mode,"live");assert.equal(proofData.amountMinor,1234);assert.equal(proofData.orderId,main);
  assert.equal((await send(event("evt_paid","pi_live_synthetic"))).status,200);
  assert.equal((await paymentStatus(main)).version,version);
  assert.equal((await invoiceStatus(mainInvoice)).version,invoiceVersion);
  assert.equal(await invoiceReceiptCount(mainInvoice),1);
  assert.equal((await send(event("evt_paid_other_id","pi_live_synthetic"))).status,200);
  assert.equal(await invoiceReceiptCount(mainInvoice),1,"alternate signed events for the same provider payment must not duplicate settlement");
  assert.equal((await db.execute("SELECT COUNT(*) AS n FROM tenant_payment_webhook_receipts WHERE payment_id='pi_live_synthetic'"))[0][0].n,1);
  const wrongInvoiceOrder=await order(),wrongInvoiceId=await invoice(wrongInvoiceOrder,12.33);
  await bind(wrongInvoiceOrder,"pi_invoice_mismatch");
  assert.equal((await send(event("evt_invoice_mismatch","pi_invoice_mismatch"))).status,200);
  assert.equal((await paymentStatus(wrongInvoiceOrder)).payment_status,"paid");
  assert.equal((await invoiceStatus(wrongInvoiceId)).status,"issued","a mismatching invoice must not be marked paid");
  assert.equal(await invoiceReceiptCount(wrongInvoiceId),0);
  const draftOrder=await order(),draftInvoice=await invoice(draftOrder,12.34,"draft");
  await bind(draftOrder,"pi_draft_invoice");
  assert.equal((await send(event("evt_draft_invoice","pi_draft_invoice"))).status,200);
  assert.equal((await paymentStatus(draftOrder)).payment_status,"paid");
  assert.equal((await invoiceStatus(draftInvoice)).status,"draft","never issue or settle an unfinished draft through a callback");
  assert.equal(await invoiceReceiptCount(draftInvoice),0);
  const mismatch=await order();await bind(mismatch,"pi_wrong_amount");
  assert.equal((await send(event("evt_amount","pi_wrong_amount",100))).status,200);assert.equal((await paymentStatus(mismatch)).payment_status,"unpaid");
  // Remove this intentionally inconsistent fixture from the disposable database before mode-rotation assertions.
  await db.execute("DELETE FROM tenant_payment_attempts WHERE tenant_id=? AND order_id=?",[account.tenant,mismatch]);
  const foreign=await order(other.tenant,foreignBranch.id,other.user);
  const otherSetup=await fetch(origin+"/api/restaurant/payments/settings",{method:"PUT",headers:{...headers,cookie:other.cookie,"x-foon-tenant":other.tenant},body:JSON.stringify(payload)});assert.equal(otherSetup.status,200);
  await db.beginTransaction();
  try{await assert.rejects(()=>registerPaymentAttempt(db,{tenantId:other.tenant,scope:"tenant",orderId:foreign,provider:"stripe",mode:"live",paymentId:"pi_live_synthetic"}),e=>e.code==="ER_DUP_ENTRY");}finally{await db.rollback();}
  assert.equal((await paymentStatus(foreign)).payment_status,"unpaid");
  assert.equal((await send({...event("evt_foreign","pi_unknown"),metadata:{order_id:foreign}})).status,200);
  assert.equal((await paymentStatus(foreign)).payment_status,"unpaid");
  const early=await order();assert.equal((await send(event("evt_early","pi_early"))).status,200);assert.equal((await paymentStatus(early)).payment_status,"unpaid");
  await bind(early,"pi_early");assert.equal((await paymentStatus(early)).payment_status,"paid");
  config=(await settings())[0];assert.ok(config.webhook.last_received_at);assert.equal(config.webhook.ready,true);
  const wrongTenant=await fetch(origin+"/api/restaurant/payments/settings",{headers:{...headers,"x-foon-tenant":other.tenant}});assert.equal(wrongTenant.status,403);
  await configure({...payload,version:2,mode:"test",public_key:"pk_test_synthetic",credentials:{secret_key:"sk_test_synthetic",webhook_secret:secret}});
  const testConfig=(await settings())[0];assert.notEqual(testConfig.webhook.url,webhook);
  assert.equal((await send(event("evt_old","pi_live_synthetic"))).status,404);
  const testOrder=await order(),sandboxInvoice=await invoice(testOrder);
  await db.execute("INSERT INTO tenant_payment_attempts(id,tenant_id,scope_key,order_id,branch_id,provider,mode,provider_payment_id,amount_minor,currency) VALUES (?,?,'tenant',?,?,'stripe','test','pi_test_synthetic',1234,'SAR')",[randomUUID(),account.tenant,testOrder,branch.id]);
  assert.equal((await send(event("evt_test","pi_test_synthetic",1234,false),testConfig.webhook.url)).status,200);
  assert.equal((await paymentStatus(testOrder)).payment_status,"unpaid");assert.equal((await settings())[0].webhook.last_status,"test_received");
  assert.equal((await invoiceStatus(sandboxInvoice)).status,"issued");assert.equal(await invoiceReceiptCount(sandboxInvoice),0,"sandbox evidence must not settle live invoices");

  const attemptStatus=async paymentId=>(await db.execute("SELECT status FROM tenant_payment_attempts WHERE tenant_id=? AND provider_payment_id=?",[account.tenant,paymentId]))[0][0]?.status;
  assert.equal(await attemptStatus("pi_test_synthetic"),"test_completed");
  const testVersion=(await paymentStatus(testOrder)).version;
  assert.equal((await send(event("evt_test","pi_test_synthetic",1234,false),testConfig.webhook.url)).status,200);
  assert.equal((await paymentStatus(testOrder)).version,testVersion,"sandbox replays must never change order version");
  // Authenticated sandbox callbacks can arrive before the server binds the provider ID.
  const earlyTest=await order();
  assert.equal((await send(event("evt_test_early","pi_test_early",1234,false),testConfig.webhook.url)).status,200);
  await db.beginTransaction();
  try{await registerPaymentAttempt(db,{tenantId:account.tenant,scope:"tenant",orderId:earlyTest,provider:"stripe",mode:"test",paymentId:"pi_test_early"});await db.commit();}catch(e){await db.rollback();throw e;}
  assert.equal(await attemptStatus("pi_test_early"),"test_completed");
  assert.equal((await paymentStatus(earlyTest)).payment_status,"unpaid");
  // Wrong amounts must leave the attempt pending and retain the settings guard.
  const wrongTest=await order();
  await db.beginTransaction();
  try{await registerPaymentAttempt(db,{tenantId:account.tenant,scope:"tenant",orderId:wrongTest,provider:"stripe",mode:"test",paymentId:"pi_test_wrong"});await db.commit();}catch(e){await db.rollback();throw e;}
  assert.equal((await send(event("evt_test_wrong","pi_test_wrong",100,false),testConfig.webhook.url)).status,200);
  assert.equal(await attemptStatus("pi_test_wrong"),"pending");
  assert.equal((await settings())[0].webhook.last_status,"amount_mismatch");
  const stillBlocked=await fetch(origin+"/api/restaurant/payments/settings",{method:"PUT",headers,body:JSON.stringify({...payload,version:3})});
  assert.equal(stillBlocked.status,409);assert.equal((await stillBlocked.json()).code,"PAYMENT_ATTEMPTS_PENDING");
  assert.equal((await send(event("evt_test_corrected","pi_test_wrong",1234,false),testConfig.webhook.url)).status,200);
  assert.equal(await attemptStatus("pi_test_wrong"),"test_completed");
  await configure({...payload,version:3});
  assert.equal((await settings())[0].mode,"live","completed sandbox attempts must allow switching to live");
  assert.equal((await fetch(testConfig.webhook.url,{method:"POST",body:"x".repeat(131073)})).status,413);
 }finally{server.kill();await db.end();}
});
