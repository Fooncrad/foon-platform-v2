import test from "node:test";
import assert from "node:assert/strict";
import {createHmac,createCipheriv,randomBytes} from "node:crypto";
import {verifyPaymentWebhook,majorToMinor} from "../lib/payments/webhook-verification.mjs";
const now=1700000000;
const stripeEvent={id:"evt_synthetic",type:"payment_intent.succeeded",livemode:true,data:{object:{id:"pi_synthetic",object:"payment_intent",status:"succeeded",currency:"sar",amount_received:1234}}};
function stripe(raw,secret="synthetic-signing-secret",timestamp=now){return "t="+timestamp+",v1="+createHmac("sha256",secret).update(timestamp+"."+raw).digest("hex");}
test("Stripe verifies the exact raw body, timestamp, environment and multiple rotation signatures",()=>{
 const raw=JSON.stringify(stripeEvent),credentials={webhook_secret:"synthetic-signing-secret"};
 const args={provider:"stripe",mode:"live",raw,credentials,now,headers:new Headers({"stripe-signature":stripe(raw)})};
 const result=verifyPaymentWebhook(args);assert.equal(result.paid,true);assert.equal(result.amountMinor,1234);
 assert.throws(()=>verifyPaymentWebhook({...args,raw:raw+" "}),/INVALID_SIGNATURE/);
 assert.throws(()=>verifyPaymentWebhook({...args,now:now+301}),/STALE_SIGNATURE/);
 assert.throws(()=>verifyPaymentWebhook({...args,mode:"test"}),/WEBHOOK_MODE_MISMATCH/);
 assert.throws(()=>verifyPaymentWebhook({...args,credentials:{webhook_secret:"other-secret"}}),/INVALID_SIGNATURE/);
 assert.equal(verifyPaymentWebhook({...args,headers:new Headers({"stripe-signature":"t="+now+",v1=old,"+stripe(raw).split(",")[1]})}).paid,true);
});
test("Stripe authorization/failure events do not confirm money",()=>{
 const raw=JSON.stringify({...stripeEvent,id:"evt_failed",type:"payment_intent.payment_failed"});
 assert.equal(verifyPaymentWebhook({provider:"stripe",mode:"live",raw,now,headers:new Headers({"stripe-signature":stripe(raw)}),credentials:{webhook_secret:"synthetic-signing-secret"}}).paid,false);
});
test("Moyasar validates the secret token and strips it from the normalized receipt",()=>{
 const event={id:"event-synthetic",type:"payment_paid",live:false,secret_token:"synthetic-token",data:{id:"payment-synthetic",status:"paid",amount:100,currency:"SAR",customer_email:"private@test.example"}};
 const args={provider:"moyasar",mode:"test",raw:JSON.stringify(event),headers:new Headers(),credentials:{webhook_secret:"synthetic-token"}};
 const normalized=verifyPaymentWebhook(args);assert.equal(normalized.paid,true);
 assert.ok(!JSON.stringify(normalized).includes("synthetic-token"));assert.ok(!JSON.stringify(normalized).includes("private@test.example"));
 assert.throws(()=>verifyPaymentWebhook({...args,credentials:{webhook_secret:"wrong"}}),/INVALID_SIGNATURE/);
 assert.throws(()=>verifyPaymentWebhook({...args,mode:"live"}),/WEBHOOK_MODE_MISMATCH/);
});
test("Tap validates provider currency precision and rejects tampered captured amounts",()=>{
 const payment={id:"chg_synthetic",object:"charge",amount:1.234,currency:"KWD",status:"CAPTURED",live_mode:false,reference:{gateway:"gw",payment:"ref"},transaction:{created:"12345"}},secret="sk_test_synthetic";
 const text="x_idchg_syntheticx_amount1.234x_currencyKWDx_gateway_referencegwx_payment_referencerefx_statusCAPTUREDx_created12345";
 const headers=new Headers({hashstring:createHmac("sha256",secret).update(text).digest("hex")});
 const args={provider:"tap",mode:"test",raw:JSON.stringify(payment),headers,credentials:{secret_key:secret}};
 assert.equal(verifyPaymentWebhook(args).amountMinor,1234);
 assert.throws(()=>verifyPaymentWebhook({...args,raw:JSON.stringify({...payment,amount:2.234})}),/INVALID_SIGNATURE/);
 assert.throws(()=>verifyPaymentWebhook({...args,headers:new Headers()}),/INVALID_SIGNATURE/);
 assert.throws(()=>verifyPaymentWebhook({...args,mode:"live"}),/WEBHOOK_MODE_MISMATCH/);
});
function hyper(event,key){
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",Buffer.from(key,"hex"),iv),body=Buffer.concat([cipher.update(JSON.stringify(event)),cipher.final()]);
 return {raw:body.toString("hex"),headers:new Headers({"x-initialization-vector":iv.toString("hex"),"x-authentication-tag":cipher.getAuthTag().toString("hex")})};
}
test("HyperPay decrypts authenticated hex payloads and rejects wrong account or tag",()=>{
 const key=randomBytes(32).toString("hex"),event={type:"PAYMENT",payload:{id:"hyper-synthetic",paymentType:"DB",amount:"10.00",currency:"SAR",authentication:{entityId:"entity-synthetic"},result:{code:"000.000.000"},timestamp:"2026-10-14 10:00:00"}};
 const encrypted=hyper(event,key),args={provider:"hyperpay",mode:"live",credentials:{webhook_secret:key},merchantReference:"entity-synthetic",...encrypted};
 assert.equal(verifyPaymentWebhook(args).paid,true);
 assert.equal(verifyPaymentWebhook({...args,raw:JSON.stringify({encryptedBody:encrypted.raw})}).amountMinor,1000);
 assert.throws(()=>verifyPaymentWebhook({...args,merchantReference:"other-entity"}),/WEBHOOK_ACCOUNT_MISMATCH/);
 assert.throws(()=>verifyPaymentWebhook({...args,credentials:{webhook_secret:randomBytes(32).toString("hex")}}),/INVALID_SIGNATURE/);
 const headers=new Headers(encrypted.headers);headers.set("x-authentication-tag","0".repeat(32));assert.throws(()=>verifyPaymentWebhook({...args,headers}),/INVALID_SIGNATURE/);
 const authorize=hyper({...event,payload:{...event.payload,paymentType:"PA"}},key);assert.equal(verifyPaymentWebhook({...args,...authorize}).paid,false);
 const internalTest=hyper({...event,payload:{...event.payload,result:{code:"000.100.110"}}},key);assert.equal(verifyPaymentWebhook({...args,...internalTest}).paid,false);
});
test("decimal conversion is exact and unsupported payloads fail closed",()=>{
 assert.equal(majorToMinor("12.34","SAR"),1234);assert.equal(majorToMinor("12.345","KWD"),12345);assert.equal(majorToMinor("12","JPY"),12);
 assert.throws(()=>majorToMinor("12.345","SAR"),/INVALID_WEBHOOK/);
 assert.throws(()=>majorToMinor(-1,"SAR"),/INVALID_WEBHOOK/);
 assert.throws(()=>verifyPaymentWebhook({provider:"custom",raw:"{}",headers:new Headers(),credentials:{}}),/UNSUPPORTED_WEBHOOK_PROVIDER/);
});

