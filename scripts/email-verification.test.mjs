import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {EMAIL_VERIFICATION_MINUTES,EMAIL_RESEND_COOLDOWN_MINUTES,queueVerificationMail,validVerificationToken,verificationTokenHash,verificationEmailCopy,verificationUrl,verificationCooldownActive} from "../lib/auth/email-verification.ts";

test("verification tokens are 256-bit random, hashed and single-use by DB policy",async()=>{
 const calls=[];
 const db={execute:async(sql,args)=>{calls.push({sql,args});return [{affectedRows:1}];}};
 await queueVerificationMail(db,{userId:"u1",email:"user@test.example",locale:"ar",origin:"https://nfoodz.com"});
 assert.equal(calls.length,2);
 assert.match(calls[0].sql,/email_verification_tokens/);
 assert.match(calls[1].sql,/platform_notification_outbox/);
 assert.equal(calls[0].args[0],calls[1].args[0],"token row and queued mail share the same ID for expiry filtering");
 assert.match(calls[0].args[2],/^[a-f0-9]{64}$/);
 assert.ok(!JSON.stringify(calls[1].args).includes(calls[0].args[2]),"outbox never gets the token hash");
 const link=String(calls[1].args[3]).match(/https:\/\/[^\s]+/)?.[0];
 const rawToken=new URL(link).searchParams.get("token");
 assert.equal(rawToken.length,43);
 assert.equal(verificationTokenHash(rawToken),calls[0].args[2]);
 assert.equal(EMAIL_VERIFICATION_MINUTES,1440);
 assert.equal(EMAIL_RESEND_COOLDOWN_MINUTES,5);
});
test("verification links validate origin and token shape",()=>{
 for(const input of [null,"",{},123,"invalid", "0".repeat(42),"0".repeat(44)])assert.equal(validVerificationToken(input),false);
 assert.equal(validVerificationToken("0".repeat(43)),true);
 assert.match(verificationUrl("https://nfoodz.com","A".repeat(43)),/verify-email\?token=/);
 assert.throws(()=>verificationUrl("javascript:alert(1)","A".repeat(43)),/INVALID_VERIFICATION_URL/);
});
test("verification messages are localized without cross-language fallback",()=>{
 for(const language of ["ar","en","fr"]){
  const result=verificationEmailCopy(language,"https://nfoodz.com/verify-email?token=TEST");
  assert.ok(result.body.includes("https://nfoodz.com/verify-email?"));
  assert.ok(result.subject.length>6);
  if(language!=="ar")assert.equal(/[\u0600-\u06ff]/.test(result.subject+result.body),false);
 }
});
test("resend uses a user-scoped five minute database window",async()=>{
 const sql=[];
 const db={execute:async(statement,args)=>{sql.push({statement,args});return [[{id:"recent"}]];}};
 assert.equal(await verificationCooldownActive(db,"u1"),true);
 assert.deepEqual(sql[0].args,["u1",5]);
 assert.match(sql[0].statement,/created_at>DATE_SUB\(NOW\(\),INTERVAL \? MINUTE\)/);
});


test("merchant workspace displays an actionable verification request and honest delivery feedback",()=>{
 const component=readFileSync(new URL("../app/restaurant/merchant-email-verification-notice.tsx",import.meta.url),"utf8");
 const dashboard=readFileSync(new URL("../app/restaurant/merchant-dashboard.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../app/restaurant/merchant-email-verification-notice.css",import.meta.url),"utf8");
 assert.match(dashboard,/!data\.emailVerified&&<MerchantEmailVerificationNotice language=\{uiLanguage\}/);
 assert.match(component,/href="\/verify-email"/);
 assert.match(component,/fetch\("\/api\/auth\/resend-verification",\{method:"POST"/);
 assert.match(component,/disabled=\{busy\} onClick=\{\(\)=>void requestLink\(\)\}/);
 assert.match(component,/result\?\.verified\?"verified":result\?\.queued\?"queued":"cooldown"/);
 assert.match(component,/هذا لا يعني أنها وصلت بالفعل/);
 assert.match(component,/role=\{status==="error"\?"alert":"status"\}/);
 assert.match(css,/@media\(max-width:600px\)/);
});
