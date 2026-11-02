import test from "node:test";
import assert from "node:assert/strict";
import {createTapHostedCheckout} from "../lib/payments/tap-hosted-checkout.mjs";
const input={mode:"test",secretKey:"sk_test_synthetic",amountMinor:1234,currency:"SAR",orderReference:"order_synthetic",idempotencyKey:"checkout_synthetic",webhookUrl:"https://store.example/api/payments/webhooks/synthetic",returnUrl:"https://store.example/customer",customer:{name:"Synthetic Customer",email:"synthetic@test.example"}};
const charge={id:"chg_synthetic",object:"charge",live_mode:false,status:"INITIATED",amount:12.34,currency:"SAR",transaction:{url:"https://sandbox.payments.tap.company/checkout/synthetic"},customer:{email:"private@test.example"}};
const response=value=>new Response(JSON.stringify(value),{status:200});
test("Tap sends a hosted source with stable idempotency and only returns minimal validated data",async()=>{
 const requests=[];
 const fetcher=async(url,options)=>{requests.push({url,options,body:JSON.parse(options.body)});return response(charge);};
 const result=await createTapHostedCheckout(input,fetcher);
 await createTapHostedCheckout(input,fetcher);
 assert.deepEqual(result,{paymentId:"chg_synthetic",url:charge.transaction.url,mode:"test",amountMinor:1234,currency:"SAR"});
 assert.equal(requests[0].url,"https://api.tap.company/v2/charges/");
 assert.equal(requests[0].options.redirect,"error");assert.equal(requests[0].options.headers.Authorization,"Bearer sk_test_synthetic");
 assert.equal(requests[0].body.source.id,"src_all");assert.equal(requests[0].body.save_card,false);assert.equal(requests[0].body.threeDSecure,true);
 assert.deepEqual(requests[0].body.reference,requests[1].body.reference);
 assert.equal(requests[0].body.reference.idempotent,input.idempotencyKey);
 assert.equal(requests[0].body.post.url,input.webhookUrl);
 assert.equal(requests[0].body.redirect.url,input.returnUrl);
 assert.ok(!JSON.stringify(result).includes("private@"));assert.ok(!JSON.stringify(result).includes(input.secretKey));
});
test("Tap preserves three-decimal and zero-decimal currencies",async()=>{
 for(const [currency,minor,major] of [["KWD",1234,1.234],["JPY",1234,1234]]){
  await createTapHostedCheckout({...input,currency,amountMinor:minor},async(_url,options)=>{assert.equal(JSON.parse(options.body).amount,major);return response({...charge,currency,amount:major});});
 }
});
test("invalid keys, callbacks, money, identity and idempotency never make a network call",async()=>{
 const cases=[{secretKey:"sk_live_synthetic"},{secretKey:"sk_test_bad\r\nvalue"},{mode:"other"},{amountMinor:0},{amountMinor:1.1},{amountMinor:Number.MAX_SAFE_INTEGER},{currency:"sar"},{webhookUrl:"http://store.example/hook"},{returnUrl:"https://user:password@store.example/customer"},{returnUrl:"javascript:alert(1)"},{idempotencyKey:""},{orderReference:"../order"},{customer:{name:"Customer",email:"invalid"}}];
 for(const invalid of cases)await assert.rejects(()=>createTapHostedCheckout({...input,...invalid},()=>assert.fail("unexpected network call")));
});
test("provider mismatches and unsafe redirect destinations fail closed",async()=>{
 const cases=[{id:"other_id"},{object:"payment"},{live_mode:true},{amount:12.35},{currency:"USD"},{status:"CAPTURED"},{transaction:{url:"http://payments.tap.company/checkout"}},{transaction:{url:"https://tap.company.evil.example/checkout"}},{transaction:{url:"https://user:secret@payments.tap.company/checkout"}},{transaction:{url:"https://payments.tap.company:8443/checkout"}},{transaction:{}}];
 for(const invalid of cases)await assert.rejects(()=>createTapHostedCheckout(input,async()=>response({...charge,...invalid})),/INVALID_GATEWAY_RESPONSE|GATEWAY_NOT_REDIRECTABLE/);
});
test("network ambiguity and provider errors do not leak provider bodies or secrets",async()=>{
 await assert.rejects(()=>createTapHostedCheckout(input,async()=>{throw new Error("private provider detail "+input.secretKey);}),{message:"GATEWAY_REQUEST_UNCERTAIN"});
 await assert.rejects(()=>createTapHostedCheckout(input,async()=>new Response("private provider detail",{status:400})),{message:"GATEWAY_REQUEST_REJECTED"});
 await assert.rejects(()=>createTapHostedCheckout(input,async()=>new Response("invalid-json")),{message:"INVALID_GATEWAY_RESPONSE"});
 await assert.rejects(()=>createTapHostedCheckout(input,async()=>new Response("x".repeat(65537))),{message:"INVALID_GATEWAY_RESPONSE"});
});
