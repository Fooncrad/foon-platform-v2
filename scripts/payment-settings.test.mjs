import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {encryptPaymentCredentials,decryptPaymentCredentials,paymentVaultReady} from "../lib/payments/credential-vault.mjs";
import {validatePaymentKeys,paymentMissingFields,PAYMENT_PROVIDERS} from "../lib/payments/provider-catalog.ts";
import {ACTIVITY_PRESETS,localizedActivityModules} from "../lib/platform/activity-presets.ts";

const key=randomBytes(32).toString("base64");
const context={tenantId:"tenant-a",scope:"branch-a",provider:"moyasar",mode:"test"};
test("gateway credentials round-trip without plaintext and use unique nonces",()=>{
 const secret={secret_key:"synthetic-key",webhook_secret:"synthetic-hook"};
 const a=encryptPaymentCredentials(secret,context,key),b=encryptPaymentCredentials(secret,context,key);
 assert.notEqual(a,b);assert.ok(!a.includes(secret.secret_key));assert.ok(!a.includes(secret.webhook_secret));
 assert.deepEqual(decryptPaymentCredentials(a,context,key),secret);
});
test("tenant, branch, gateway and environment substitutions cannot decrypt",()=>{
 const envelope=encryptPaymentCredentials({secret_key:"synthetic-key"},context,key);
 for(const changed of [{tenantId:"tenant-b"},{scope:"branch-b"},{provider:"stripe"},{mode:"live"}]){
  assert.throws(()=>decryptPaymentCredentials(envelope,{...context,...changed},key));
 }
 assert.throws(()=>decryptPaymentCredentials(envelope,context,randomBytes(32).toString("base64")));
});
test("tampered authentication tags and ciphertext are rejected",()=>{
 const envelope=encryptPaymentCredentials({secret_key:"synthetic-key"},context,key);
 for(const index of [1,2,3]){
  const parts=envelope.split(".");const bytes=Buffer.from(parts[index],"base64");bytes[0]^=1;parts[index]=bytes.toString("base64");
  assert.throws(()=>decryptPaymentCredentials(parts.join("."),context,key));
 }
 assert.throws(()=>decryptPaymentCredentials("v2.x.y.z",context,key));
});
test("missing or malformed encryption keys fail closed",()=>{
 for(const invalid of ["","short",Buffer.alloc(16).toString("base64"),"x".repeat(44)]){
  assert.throws(()=>encryptPaymentCredentials({secret_key:"test"},context,invalid),/PAYMENT_VAULT_NOT_CONFIGURED/);
 }
 const prior=process.env.FOON_PAYMENT_VAULT_KEY;delete process.env.FOON_PAYMENT_VAULT_KEY;
 assert.equal(paymentVaultReady(),false);
 process.env.FOON_PAYMENT_VAULT_KEY=key;assert.equal(paymentVaultReady(),true);
 if(prior===undefined)delete process.env.FOON_PAYMENT_VAULT_KEY;else process.env.FOON_PAYMENT_VAULT_KEY=prior;
});
test("test keys cannot be configured as live keys and restricted Stripe keys are accepted",()=>{
 for(const provider of ["moyasar","tap","stripe"]){
  assert.doesNotThrow(()=>validatePaymentKeys(provider,"test","pk_test_synthetic","sk_test_synthetic"));
  assert.throws(()=>validatePaymentKeys(provider,"live","pk_test_synthetic","sk_live_synthetic"),/PAYMENT_KEY_MODE_MISMATCH/);
  assert.throws(()=>validatePaymentKeys(provider,"test","pk_test_synthetic","sk_live_synthetic"),/PAYMENT_KEY_MODE_MISMATCH/);
 }
 assert.doesNotThrow(()=>validatePaymentKeys("stripe","live","pk_live_synthetic","rk_live_synthetic"));
 assert.throws(()=>validatePaymentKeys("stripe","live","pk_live_synthetic","rk_test_synthetic"));
});
test("gateway readiness reports actual missing credential fields",()=>{
 assert.deepEqual(paymentMissingFields("manual",null,"CASH",{}),[]);
 assert.deepEqual(paymentMissingFields("moyasar",null,null,{}),["public_key","secret_key","webhook_secret"]);
 assert.deepEqual(paymentMissingFields("hyperpay",null,null,{}),["merchant_reference","secret_key","webhook_secret"]);
 assert.deepEqual(paymentMissingFields("stripe","pk_test_synthetic",null,{secret_key:true,webhook_secret:true}),[]);
 assert.equal(Object.keys(PAYMENT_PROVIDERS).length,6);
});
test("all 14 activities expose payment settings in three languages",()=>{
 assert.equal(Object.keys(ACTIVITY_PRESETS).length,14);
 for(const [activity,modules] of Object.entries(ACTIVITY_PRESETS)){
  assert.ok(modules.includes("payments"),activity);
  for(const language of ["ar","en","fr"]){
   const payment=localizedActivityModules(activity,language).find(x=>x.code==="payments");
   assert.ok(payment?.label?.trim(),activity+"/"+language);
  }
 }
});
test("cafes retain the full table, waiter, reservation and waitlist workflow",()=>{
 for(const feature of ["tables","waiter","reservations","waitlist","kitchen","orders","pos"]){
  assert.ok(ACTIVITY_PRESETS.cafe.includes(feature),feature);
 }
});

