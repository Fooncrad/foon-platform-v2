import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID,randomBytes,createHmac} from "node:crypto";
import {spawn} from "node:child_process";
import mysql from "mysql2/promise";
import {countryRegions} from "../lib/tenant/country-catalog.ts";
import {registerPaymentAttempt,registerServiceInvoicePaymentAttempt} from "../lib/payments/webhook-settlement.ts";
import {startServiceInvoiceSandboxCheckout} from "../lib/payments/service-invoice-checkout.ts";
import {encryptPaymentCredentials} from "../lib/payments/credential-vault.mjs";


test("webhook routes verify signatures, settle mapped live orders exactly once and expose scoped metadata",async()=>{
 const url=new URL(process.env.DATABASE_URL||"");assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/foon_migration_test");
 const db=await mysql.createConnection(url.href),origin="http://127.0.0.1:3120",vault=randomBytes(32).toString("base64");
 process.env.FOON_PAYMENT_VAULT_KEY=vault;
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p","3120"],{env:{...process.env,APP_URL:origin,FOON_PAYMENT_VAULT_KEY:vault},stdio:["ignore","pipe","pipe"]});
 let output="";server.stdout.on("data",c=>output+=c);server.stderr.on("data",c=>output+=c);
 try{
  let ready=false;for(let i=0;i<60;i++){try{await fetch(origin+"/login",{signal:AbortSignal.timeout(2000)});ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}assert.ok(ready,output);
  async function owner(){const suffix=randomUUID().slice(0,8);const r=await fetch(origin+"/api/auth/register",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({email:"webhook-"+suffix+"@test.example",password:"synthetic-long-password-2026",name:"Webhook owner",storeName:"Webhook "+suffix,slug:"webhook-"+suffix,activity:"grocery",countryCode:"SA",currency:"SAR",region:countryRegions.SA[0],legalAccepted:true})});assert.equal(r.status,201,await r.clone().text());const data=await r.json();return {tenant:data.tenant.id,cookie:r.headers.get("set-cookie").split(";")[0],user:data.user.id,slug:"webhook-"+suffix};}
  const account=await owner(),other=await owner();
  const headers={cookie:account.cookie,"x-foon-tenant":account.tenant,origin,"content-type":"application/json"};
  // Explicitly grant invoice access to the disposable test tenant only.
  // Production/free-plan entitlement checks stay unchanged.
  const invoicePlan="webhook-invoice-"+randomUUID().slice(0,8);
  await db.execute("INSERT INTO package_plans(id,code,name_ar,name_en,name_fr) VALUES (?,?,'اختبار الفواتير','Invoice Test','Test facture')",[invoicePlan,invoicePlan]);
  await db.execute("INSERT IGNORE INTO package_features(feature_key,name_ar,name_en,category) VALUES ('customer_invoices','فواتير العملاء','Customer invoices','test')");
  await db.execute("INSERT INTO package_plan_features(plan_id,feature_key,enabled) VALUES (?,'customer_invoices',TRUE)",[invoicePlan]);
  await db.execute("UPDATE tenant_subscriptions SET plan_id=? WHERE tenant_id=?",[invoicePlan,account.tenant]);

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
  // Bind a genuine customer, preserving the staff/customer separation and tenant FK.
  const customerResponse=await fetch(origin+"/api/customer/register",{method:"POST",headers:{origin,"content-type":"application/json",cookie:"foon_language=en"},body:JSON.stringify({name:"Payment customer",email:randomUUID()+"@test.example",password:"synthetic-customer-password-2026",storeSlug:account.slug})});assert.equal(customerResponse.status,201,await customerResponse.clone().text());const customerId=(await customerResponse.json()).user.id;
  await db.execute("UPDATE restaurant_orders SET customer_user_id=? WHERE id=?",[customerId,main]);
  // Disposable test account: explicitly verify the email before asserting SMTP queue creation.
  await db.execute("UPDATE users SET email_verified_at=NOW() WHERE id=?",[customerId]);
  const paidNotices=async()=>Number((await db.execute("SELECT COUNT(*) AS n FROM customer_notifications WHERE user_id=? AND resource_id=? AND event_key='order_invoice'",[customerId,main]))[0][0].n);

  const blockedChange=await fetch(origin+"/api/restaurant/payments/settings",{method:"PUT",headers,body:JSON.stringify({...payload,version:2,mode:"test",public_key:"pk_test_synthetic",credentials:{secret_key:"sk_test_synthetic",webhook_secret:secret}})});assert.equal(blockedChange.status,409);assert.equal((await blockedChange.json()).code,"PAYMENT_ATTEMPTS_PENDING");
  assert.equal((await send(event("evt_invalid","pi_live_synthetic"),webhook,false)).status,400);
  assert.equal((await paymentStatus(main)).payment_status,"unpaid");
  assert.equal((await invoiceStatus(mainInvoice)).status,"issued");assert.equal(await invoiceReceiptCount(mainInvoice),0);
  assert.equal((await send(event("evt_case_sensitive","pi_LIVE_synthetic"))).status,200);assert.equal((await paymentStatus(main)).payment_status,"unpaid");
  assert.equal((await send(event("evt_paid","pi_live_synthetic"))).status,200);
  assert.equal(await paidNotices(),1);
  assert.equal(Number((await db.execute("SELECT COUNT(*) AS n FROM restaurant_customer_invoices WHERE tenant_id=? AND order_id=? AND invoice_kind='receipt'",[account.tenant,main]))[0][0].n),1);
  assert.equal((await paymentStatus(main)).payment_status,"paid");const version=(await paymentStatus(main)).version;
  assert.equal((await invoiceStatus(mainInvoice)).status,"paid","an issued order invoice follows the verified live payment");
  const invoiceVersion=(await invoiceStatus(mainInvoice)).version;
  assert.equal(await invoiceReceiptCount(mainInvoice),1);
  const [[proof]]=await db.execute("SELECT data FROM restaurant_resources WHERE tenant_id=? AND kind='invoice_settlement' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.invoiceId'))=?",[account.tenant,mainInvoice]);
  const proofData=typeof proof.data==="string"?JSON.parse(proof.data):proof.data;
  assert.equal(proofData.source,"provider_verified_webhook");assert.equal(proofData.provider,"stripe");
  assert.equal(proofData.mode,"live");assert.equal(proofData.amountMinor,1234);assert.equal(proofData.orderId,main);
  const gatewayReviewPayload={invoiceId:mainInvoice,reason:"Gateway-paid invoice requires a refund investigation",reviewAcknowledged:true};
  const gatewayReview=await fetch(origin+"/api/restaurant/payments/refund-reviews",{method:"POST",headers,body:JSON.stringify(gatewayReviewPayload)});
  assert.equal(gatewayReview.status,201,await gatewayReview.clone().text());
  assert.equal((await gatewayReview.json()).financialEffect,"none");
  const [[gatewayReviewRow]]=await db.execute("SELECT data,status FROM restaurant_resources WHERE tenant_id=? AND kind='invoice_refund_review' AND lookup_key=?",[account.tenant,mainInvoice]);
  const gatewayReviewData=typeof gatewayReviewRow.data==="string"?JSON.parse(gatewayReviewRow.data):gatewayReviewRow.data;
  assert.equal(gatewayReviewRow.status,"review_pending");
  assert.equal(gatewayReviewData.source,"gateway");
  assert.equal(gatewayReviewData.originalAmountMinor,1234);
  assert.equal(gatewayReviewData.currency,"SAR");
  assert.equal(gatewayReviewData.provider,"stripe");
  assert.equal((await invoiceStatus(mainInvoice)).status,"paid","a refund review never reverses a gateway payment");
  // Independent second-owner rejection of a live-gateway-backed case.
  await db.execute("INSERT INTO memberships(id,tenant_id,user_id,role,status) VALUES (?,?,?,'owner','active')",[randomUUID(),account.tenant,other.user]);
  const gatewayDecision={reviewId:(await db.execute("SELECT id FROM restaurant_resources WHERE tenant_id=? AND kind='invoice_refund_review' AND lookup_key=?",[account.tenant,mainInvoice]))[0][0].id,decision:"reject",note:"Gateway refund request is outside the merchant return policy",acknowledgeNoRefund:true};
  const selfDenied=await fetch(origin+"/api/restaurant/payments/refund-reviews",{method:"PATCH",headers,body:JSON.stringify(gatewayDecision)});
  assert.equal(selfDenied.status,403);
  const approverHeaders={...headers,cookie:other.cookie,"x-foon-tenant":account.tenant};
  const missingRejectionReason=await fetch(origin+"/api/restaurant/payments/refund-reviews",{method:"PATCH",headers:approverHeaders,body:JSON.stringify({...gatewayDecision,note:"short"})});
  assert.equal((await missingRejectionReason.json()).code,"REFUND_REJECTION_REASON_REQUIRED");
  const [firstRejection,secondRejection]=await Promise.all([fetch(origin+"/api/restaurant/payments/refund-reviews",{method:"PATCH",headers:approverHeaders,body:JSON.stringify(gatewayDecision)}),fetch(origin+"/api/restaurant/payments/refund-reviews",{method:"PATCH",headers:approverHeaders,body:JSON.stringify(gatewayDecision)})]);
  assert.equal(firstRejection.status,200,await firstRejection.clone().text());
  assert.equal(secondRejection.status,200,await secondRejection.clone().text());
  const r1=await firstRejection.json(),r2=await secondRejection.json();
  assert.equal(r1.status,"rejected");assert.equal(r2.status,"rejected");
  assert.equal(Number(Boolean(r1.existing))+Number(Boolean(r2.existing)),1);
  assert.equal(r1.financialEffect,"none");
  assert.equal((await invoiceStatus(mainInvoice)).status,"paid");
  const [[rejectAudit]]=await db.execute("SELECT COUNT(*) AS n FROM restaurant_audit_events WHERE tenant_id=? AND resource_id=? AND action='customer_invoice.refund_review_reject'",[account.tenant,mainInvoice]);
  assert.equal(Number(rejectAudit.n),1);

  assert.equal((await send(event("evt_paid","pi_live_synthetic"))).status,200);
  assert.equal((await paymentStatus(main)).version,version);
  assert.equal((await invoiceStatus(mainInvoice)).version,invoiceVersion);
  assert.equal(await invoiceReceiptCount(mainInvoice),1);
  assert.equal((await send(event("evt_paid_other_id","pi_live_synthetic"))).status,200);
  assert.equal(await invoiceReceiptCount(mainInvoice),1,"alternate signed events for the same provider payment must not duplicate settlement");
  // Each distinct authenticated event is preserved, while the financial settlement is unique.
  assert.equal((await db.execute("SELECT COUNT(*) AS n FROM tenant_payment_webhook_receipts WHERE payment_id='pi_live_synthetic'"))[0][0].n,2);
  assert.equal(await paidNotices(),1,"distinct verified replay events cannot send duplicate payment notices");
  const [[mailNotice]]=await db.execute("SELECT COUNT(*) AS n FROM platform_notification_outbox WHERE tenant_id=? AND event_key='order_invoice'",[account.tenant]);assert.equal(Number(mailNotice.n),1);

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
  // A gateway can settle the order BEFORE the merchant creates or issues its invoice.
  // Only the independently verified live payment evidence may catch it up.
  const lateOrder=await order();await bind(lateOrder,"pi_late_invoice");
  assert.equal((await send(event("evt_late_invoice","pi_late_invoice"))).status,200);
  assert.equal((await paymentStatus(lateOrder)).payment_status,"paid");
  async function merchantInvoice(body,method="POST"){
   const response=await fetch(origin+"/api/restaurant/operations/customerInvoices",{method,headers,body:JSON.stringify(body)});
   return {status:response.status,body:await response.json()};
  }
  const late=await merchantInvoice({name:"Invoice issued after confirmed payment",status:"issued",branchId:branch.id,data:{orderId:lateOrder,subtotal:12.34,taxAmount:0,serviceFee:0}});
  assert.equal(late.status,201,JSON.stringify(late.body));
  assert.equal(late.body.gatewayReconciliation,"reconciled",JSON.stringify(late.body));
  assert.equal((await invoiceStatus(late.body.id)).status,"paid");
  assert.equal(await invoiceReceiptCount(late.body.id),1);
  const [[lateProof]]=await db.execute("SELECT data FROM restaurant_resources WHERE tenant_id=? AND kind='invoice_settlement' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.invoiceId'))=?",[account.tenant,late.body.id]);
  const lateProofData=typeof lateProof.data==="string"?JSON.parse(lateProof.data):lateProof.data;
  assert.equal(lateProofData.providerPaymentId,"pi_late_invoice");assert.equal(lateProofData.source,"provider_verified_webhook");
  assert.equal((await send(event("evt_late_second","pi_late_invoice"))).status,200);
  assert.equal(await invoiceReceiptCount(late.body.id),1);

  const draftFirstOrder=await order();
  const draftFirst=await merchantInvoice({name:"Prepayment draft",status:"draft",branchId:branch.id,data:{orderId:draftFirstOrder,subtotal:12.34,taxAmount:0,serviceFee:0}});
  assert.equal(draftFirst.status,201,JSON.stringify(draftFirst.body));
  await bind(draftFirstOrder,"pi_draft_later");
  assert.equal((await send(event("evt_draft_later","pi_draft_later"))).status,200);
  assert.equal((await invoiceStatus(draftFirst.body.id)).status,"draft");
  assert.equal(await invoiceReceiptCount(draftFirst.body.id),0);
  const draftRecord=(await db.execute("SELECT name,version,data,branch_id FROM restaurant_resources WHERE id=? AND tenant_id=?",[draftFirst.body.id,account.tenant]))[0][0];
  const issuedLate=await merchantInvoice({id:draftFirst.body.id,version:draftRecord.version,name:draftRecord.name,status:"issued",branchId:draftRecord.branch_id,data:typeof draftRecord.data==="string"?JSON.parse(draftRecord.data):draftRecord.data},"PATCH");
  assert.equal(issuedLate.status,200,JSON.stringify(issuedLate.body));
  assert.equal(issuedLate.body.gatewayReconciliation,"reconciled");
  assert.equal((await invoiceStatus(draftFirst.body.id)).status,"paid");
  assert.equal(await invoiceReceiptCount(draftFirst.body.id),1);

  const merchantMarked=await order();
  await db.execute("UPDATE restaurant_orders SET payment_status='paid' WHERE id=? AND tenant_id=?",[merchantMarked,account.tenant]);
  const noTrustedProof=await merchantInvoice({name:"Manual-only order",status:"issued",branchId:branch.id,data:{orderId:merchantMarked,subtotal:12.34,taxAmount:0,serviceFee:0}});
  assert.equal(noTrustedProof.status,201,JSON.stringify(noTrustedProof.body));
  assert.equal(noTrustedProof.body.gatewayReconciliation,"not_applicable","a plain paid flag must not impersonate gateway evidence");
  assert.equal((await invoiceStatus(noTrustedProof.body.id)).status,"issued");
  assert.equal(await invoiceReceiptCount(noTrustedProof.body.id),0);

  const foreignInvoiceAttempt=await merchantInvoice({name:"Foreign tenant invoice",status:"issued",branchId:branch.id,data:{orderId:foreign,subtotal:12.34,taxAmount:0,serviceFee:0}});
  assert.notEqual(foreignInvoiceAttempt.status,201);
  // Standalone service invoices: only an already-created provider charge can be
  // bound server-side, and only its authentic signed callback settles that invoice.
  async function serviceInvoice(value=34.5,tenant=account.tenant,branchId=branch.id){
   const serviceId=randomUUID(),id=randomUUID();
   await db.execute("INSERT INTO restaurant_resources(id,tenant_id,branch_id,kind,name,status,data) VALUES (?,?,?,?,?,?,?)",[serviceId,tenant,branchId,"service_order","Completed repair","completed",JSON.stringify({customerName:"Service guest",serviceDescription:"Repair",amount:value})]);
   await db.execute("INSERT INTO restaurant_resources(id,tenant_id,branch_id,kind,name,status,data) VALUES (?,?,?,?,?,?,?)",[id,tenant,branchId,"customer_invoice","Service payment","issued",JSON.stringify({serviceOrderId:serviceId,subtotal:value,taxAmount:0,serviceFee:0})]);
   return {serviceId,id};
  }
  async function bindService(invoiceId,paymentId,mode="live",scope="tenant",tenantId=account.tenant){
   await db.beginTransaction();
   try{const saved=await registerServiceInvoicePaymentAttempt(db,{tenantId,scope,invoiceId,provider:"stripe",mode,paymentId});await db.commit();return saved;}catch(error){await db.rollback();throw error;}
  }
  const service=await serviceInvoice();
  await assert.rejects(()=>bindService(service.id,"pi_wrong_scope","live",foreignBranch.id),/PAYMENT_CONFIGURATION_CHANGED|INVOICE_NOT_PAYABLE/);
  await assert.rejects(()=>bindService(randomUUID(),"pi_unknown_invoice"),/INVOICE_NOT_PAYABLE/);
  await assert.rejects(()=>bindService(service.id,"pi_other_tenant_service","live","tenant",other.tenant),/INVOICE_NOT_PAYABLE/);
  await bindService(service.id,"pi_service_verified");
  const [[serviceAttemptBefore]]=await db.execute("SELECT status,amount_minor FROM tenant_service_invoice_payment_attempts WHERE tenant_id=? AND invoice_id=?",[account.tenant,service.id]);
  assert.equal(serviceAttemptBefore.status,"pending");assert.equal(Number(serviceAttemptBefore.amount_minor),3450);
  assert.equal((await send(event("evt_service_bad_signature","pi_service_verified",3450),webhook,false)).status,400);
  assert.equal((await invoiceStatus(service.id)).status,"issued");
  assert.equal((await send(event("evt_service_wrong_amount","pi_service_verified",3400))).status,200);
  assert.equal((await invoiceStatus(service.id)).status,"issued");
  const liveRotation=await fetch(origin+"/api/restaurant/payments/settings",{method:"PUT",headers,body:JSON.stringify({...payload,version:2,mode:"test",public_key:"pk_test_synthetic",credentials:{secret_key:"sk_test_synthetic",webhook_secret:secret}})});
  assert.equal(liveRotation.status,409);
  assert.equal((await liveRotation.json()).code,"PAYMENT_ATTEMPTS_PENDING","open service attempt must block credential rotation");
  assert.equal((await send(event("evt_service_paid","pi_service_verified",3450))).status,200);
  assert.equal((await invoiceStatus(service.id)).status,"paid");
  assert.equal(await invoiceReceiptCount(service.id),1);
  const [[serviceProofRow]]=await db.execute("SELECT data FROM restaurant_resources WHERE tenant_id=? AND kind='invoice_settlement' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.invoiceId'))=?",[account.tenant,service.id]);
  const serviceProof=typeof serviceProofRow.data==="string"?JSON.parse(serviceProofRow.data):serviceProofRow.data;
  assert.equal(serviceProof.source,"provider_verified_webhook");
  assert.equal(serviceProof.providerPaymentId,"pi_service_verified");
  assert.equal(serviceProof.serviceOrderId,service.serviceId);
  assert.equal(serviceProof.amountMinor,3450);
  const paidServiceVersion=(await invoiceStatus(service.id)).version;
  assert.equal((await send(event("evt_service_paid","pi_service_verified",3450))).status,200);
  assert.equal((await send(event("evt_service_duplicate_event","pi_service_verified",3450))).status,200);
  assert.equal((await invoiceStatus(service.id)).version,paidServiceVersion);
  assert.equal(await invoiceReceiptCount(service.id),1);
  const secondService=await serviceInvoice(12.34);
  await assert.rejects(()=>bindService(secondService.id,"pi_service_verified"),/PROVIDER_PAYMENT_ALREADY_BOUND/);
  await assert.rejects(()=>bindService(secondService.id,"pi_late_invoice"),/PROVIDER_PAYMENT_ALREADY_BOUND/);
  // An authenticated callback can precede provider attempt binding.
  assert.equal((await send(event("evt_service_early","pi_service_early",1234))).status,200);
  assert.equal((await invoiceStatus(secondService.id)).status,"issued");
  await bindService(secondService.id,"pi_service_early");
  assert.equal((await invoiceStatus(secondService.id)).status,"paid");
  assert.equal(await invoiceReceiptCount(secondService.id),1);
  config=(await settings())[0];assert.ok(config.webhook.last_received_at);assert.equal(config.webhook.ready,true);
  const wrongTenant=await fetch(origin+"/api/restaurant/payments/settings",{headers:{...headers,"x-foon-tenant":other.tenant}});assert.equal(wrongTenant.status,403);
  await configure({...payload,version:2,mode:"test",public_key:"pk_test_synthetic",credentials:{secret_key:"sk_test_synthetic",webhook_secret:secret}});
  const testConfig=(await settings())[0];assert.notEqual(testConfig.webhook.url,webhook);
  assert.equal((await send(event("evt_old","pi_live_synthetic"))).status,404);
  const sandboxService=await serviceInvoice(12.34);
  await bindService(sandboxService.id,"pi_service_sandbox","test");
  assert.equal((await send(event("evt_service_sandbox","pi_service_sandbox",1234,false),testConfig.webhook.url)).status,200);
  assert.equal((await invoiceStatus(sandboxService.id)).status,"issued","sandbox service callbacks must never mark invoices paid");
  assert.equal(await invoiceReceiptCount(sandboxService.id),0);
  const [[testServiceStatus]]=await db.execute("SELECT status FROM tenant_service_invoice_payment_attempts WHERE tenant_id=? AND invoice_id=?",[account.tenant,sandboxService.id]);
  assert.equal(testServiceStatus.status,"test_completed");
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
  // Merchant-initiated Tap sandbox checkout for a standalone issued service invoice.
  // No real payment provider API calls occur: the network adapter is mocked.
  const tapSecret="sk_test_synthetic";
  const tapEndpoint=randomBytes(24).toString("hex");
  const encryptedTap=encryptPaymentCredentials({secret_key:tapSecret},{tenantId:account.tenant,scope:"tenant",provider:"tap",mode:"test"});
  await db.execute("UPDATE tenant_payment_settings SET provider='tap',enabled=TRUE,currency='SAR' WHERE tenant_id=? AND scope_key='tenant'",[account.tenant]);
  await db.execute("UPDATE tenant_payment_gateway_credentials SET provider='tap',mode='test',credentials_ciphertext=?,secret_key_set=TRUE,webhook_secret_set=FALSE WHERE tenant_id=? AND scope_key='tenant'",[encryptedTap,account.tenant]);
  await db.execute("UPDATE tenant_payment_webhook_endpoints SET endpoint_id=?,provider='tap',mode='test' WHERE tenant_id=? AND scope_key='tenant'",[tapEndpoint,account.tenant]);
  const checkoutService=await serviceInvoice(23.45);
  const checkoutPool=mysql.createPool({uri:url.href,connectionLimit:4});
  try{
   let gatewayCalls=0;
   const [[gatewayVersion]]=await db.execute("SELECT version FROM tenant_payment_gateway_credentials WHERE tenant_id=? AND scope_key='tenant'",[account.tenant]);
   const rotateGateway=()=>fetch(origin+"/api/restaurant/payments/settings",{method:"PUT",headers,body:JSON.stringify({...payload,branch_id:null,provider:"tap",mode:"test",enabled:false,public_key:"pk_test_synthetic",version:Number(gatewayVersion.version),credentials:{}})});
   const fakeTap=async(urlTarget,options)=>{
    gatewayCalls++;
    assert.equal(urlTarget,"https://api.tap.company/v2/charges/");
    assert.ok(String(options.headers.Authorization).includes(tapSecret));
    const request=JSON.parse(options.body);
    assert.equal(request.amount,23.45);
    assert.equal(request.reference.order,checkoutService.id);
    assert.equal(request.post.url,"https://foon-test.example/api/payments/webhooks/"+tapEndpoint);
    assert.equal(request.customer.email,"service-customer@example.test");
    const [[creating]]=await db.execute("SELECT state,provider_payment_id FROM tenant_service_invoice_checkouts WHERE tenant_id=? AND invoice_id=?",[account.tenant,checkoutService.id]);
    assert.equal(creating.state,"creating");assert.equal(creating.provider_payment_id,null);
    const whileCreating=await rotateGateway();
    assert.equal(whileCreating.status,409,"gateway keys must stay fixed before Tap returns payment ID");
    assert.equal((await whileCreating.json()).code,"PAYMENT_ATTEMPTS_PENDING");
    return new Response(JSON.stringify({id:"chg_service_sandbox_2026",object:"charge",status:"INITIATED",live_mode:false,currency:"SAR",amount:23.45,transaction:{url:"https://test.tap.company/sandbox/invoice-service-1"}}),{status:200,headers:{"content-type":"application/json"}});
   };
   const params={tenantId:account.tenant,userId:account.user,invoiceId:checkoutService.id,customerEmail:"service-customer@example.test",appUrl:"https://foon-test.example"};
   const started=await startServiceInvoiceSandboxCheckout(checkoutPool,params,fakeTap);
   assert.equal(started.state,"ready");assert.equal(started.mode,"test");assert.equal(gatewayCalls,1);
   assert.equal(started.url,"https://test.tap.company/sandbox/invoice-service-1");
   assert.equal((await invoiceStatus(checkoutService.id)).status,"issued");
   const [[checkoutRecord]]=await db.execute("SELECT state,provider_payment_id,payload_hash,hosted_url FROM tenant_service_invoice_checkouts WHERE tenant_id=? AND invoice_id=?",[account.tenant,checkoutService.id]);
   assert.equal(checkoutRecord.state,"ready");
   assert.equal(checkoutRecord.provider_payment_id,"chg_service_sandbox_2026");
   assert.equal(checkoutRecord.payload_hash.length,64);
   assert.equal(await invoiceReceiptCount(checkoutService.id),0);
   const whileReady=await rotateGateway();
   assert.equal(whileReady.status,409,"a ready checkout with a pending payment still locks credentials");
   assert.equal((await whileReady.json()).code,"PAYMENT_ATTEMPTS_PENDING");
   const replay=await startServiceInvoiceSandboxCheckout(checkoutPool,params,()=>{throw Error("DUPLICATE_PROVIDER_REQUEST");});
   assert.equal(replay.url,started.url);assert.equal(gatewayCalls,1);
   await assert.rejects(()=>startServiceInvoiceSandboxCheckout(checkoutPool,{...params,customerEmail:"different@example.test"},fakeTap),error=>error.message==="CHECKOUT_REVIEW_REQUIRED");
   assert.equal(gatewayCalls,1);
   const invalidRoute=await fetch(origin+"/api/restaurant/payments/service-checkout",{method:"POST",headers,body:JSON.stringify({invoiceId:checkoutService.id,customerEmail:params.customerEmail,consentConfirmed:false})});
   assert.equal(invalidRoute.status,400);
   // CI deliberately uses a local HTTP origin; hosted checkout creation must fail closed.
   const insecureRoute=await fetch(origin+"/api/restaurant/payments/service-checkout",{method:"POST",headers,body:JSON.stringify({invoiceId:checkoutService.id,customerEmail:params.customerEmail,consentConfirmed:true})});
   assert.equal(insecureRoute.status,503);
   assert.equal((await insecureRoute.json()).code,"CHECKOUT_HTTPS_REQUIRED");
   const tapEvent={id:"chg_service_sandbox_2026",object:"charge",status:"CAPTURED",amount:23.45,currency:"SAR",live_mode:false,reference:{gateway:"",payment:""},transaction:{created:"2026-10-15T01:00:00Z"}};
   const signedText="x_id"+tapEvent.id+"x_amount23.45x_currencySARx_gateway_referencex_payment_referencex_statusCAPTUREDx_created"+tapEvent.transaction.created;
   const hash=createHmac("sha256",tapSecret).update(signedText).digest("hex");
   const tapWebhook=await fetch(origin+"/api/payments/webhooks/"+tapEndpoint,{method:"POST",headers:{"content-type":"application/json",hashstring:hash},body:JSON.stringify(tapEvent)});
   assert.equal(tapWebhook.status,200,await tapWebhook.clone().text());
   assert.equal((await invoiceStatus(checkoutService.id)).status,"issued","test checkout must never settle real invoices");
   const [[attempt]]=await db.execute("SELECT status FROM tenant_service_invoice_payment_attempts WHERE tenant_id=? AND invoice_id=?",[account.tenant,checkoutService.id]);
   assert.equal(attempt.status,"test_completed");
   const replayCompleted=await startServiceInvoiceSandboxCheckout(checkoutPool,params,()=>{throw Error("REPEATED_CHARGE");});
   assert.equal(replayCompleted.state,"test_completed");
   const completedRotation=await rotateGateway();
   assert.equal(completedRotation.status,200,"settled sandbox attempts should no longer pin gateway configuration");
  }finally{await checkoutPool.end();}

 }finally{server.kill();await db.end();}
});
