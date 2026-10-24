import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import mysql from "mysql2/promise";

function sessionCookie(response){
 const value=response.headers.get("set-cookie")||"";
 const match=value.match(/(?:^|,\s*)foon_session=[^;,\s]+/);
 assert.ok(match,"authentication must issue the foon_session cookie");
 return match[0].trim();
}

test("production registration routes activate owners and isolate store customers",async()=>{
 const url=new URL(process.env.DATABASE_URL||"");
 assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/foon_migration_test");
 const db=await mysql.createConnection(url.href);await db.query("SET time_zone='+00:00'");
 const origin="http://127.0.0.1:3101";
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p","3101"],{env:{...process.env,APP_URL:origin},stdio:["ignore","pipe","pipe"]});
 let output="";server.stdout.on("data",chunk=>{output+=chunk;});server.stderr.on("data",chunk=>{output+=chunk;});
 const post=(path,body,source=origin)=>fetch(origin+path,{method:"POST",headers:{"content-type":"application/json",origin:source},body:JSON.stringify(body)});
 try{
  let ready=false;
  for(let i=0;i<60;i++){
   try{await fetch(origin+"/login");ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,500));}
  }
  assert.ok(ready,output);
  const owner={email:"http-owner@test.example",password:"a-strong-test-password",name:"Owner",storeName:"HTTP store",slug:"http-owner-store",kind:"store",activity:"grocery",countryCode:"SA",currency:"SAR",region:"الرياض",legalAccepted:true};
  assert.equal((await post("/api/auth/register",owner,"https://foreign.example")).status,403);
  assert.equal((await post("/api/auth/register",{...owner,slug:"admin"})).status,400);
  assert.equal((await post("/api/auth/register",{...owner,legalAccepted:false})).status,400);
  const created=await post("/api/auth/register",owner);assert.equal(created.status,201,await created.clone().text());
  assert.match(created.headers.get("set-cookie")||"",/foon_session=/);
  const result=await created.json();assert.equal(result.plan,"free");assert.equal(result.tenant.status,"active");
  // Registration stays accessible while mail is pending, but the email link
  // now verifies ownership and is strictly single-use with origin protection.
  const [verifications]=await db.execute("SELECT id,subject,body_text FROM platform_notification_outbox WHERE event_key='email_verification' AND recipient_email=? ORDER BY created_at DESC LIMIT 1",[owner.email]);
  assert.equal(verifications.length,1,"registration must enqueue a verification link");
  const verificationLink=String(verifications[0].body_text).match(/https?:\/\/[^\s]+/)?.[0];
  assert.ok(verificationLink,"email includes the one-time verification URL");
  const verificationToken=new URL(verificationLink).searchParams.get("token");
  assert.match(verificationToken,/^[A-Za-z0-9_-]{43}$/);
  const ownerVerifiedBefore=await db.execute("SELECT email_verified_at FROM users WHERE id=?",[result.user.id]);
  assert.equal(ownerVerifiedBefore[0][0].email_verified_at,null);
  assert.equal((await post("/api/auth/verify-email",{token:verificationToken},"https://foreign.example")).status,403);
  const ownerCookieForVerification=sessionCookie(created);
  const resend=await fetch(origin+"/api/auth/resend-verification",{method:"POST",headers:{origin,cookie:ownerCookieForVerification,"content-type":"application/json"},body:"{}"});
  assert.equal(resend.status,200);
  assert.equal((await resend.json()).queued,false,"a recent link may not be resent immediately");
  const verified=await post("/api/auth/verify-email",{token:verificationToken});
  assert.equal(verified.status,200,await verified.clone().text());
  const [[verifiedUser]]=await db.execute("SELECT email_verified_at FROM users WHERE id=?",[result.user.id]);
  assert.ok(verifiedUser.email_verified_at);
  assert.equal((await post("/api/auth/verify-email",{token:verificationToken})).status,400,"single-use link must reject second use");
  const verifiedResend=await fetch(origin+"/api/auth/resend-verification",{method:"POST",headers:{origin,cookie:ownerCookieForVerification,"content-type":"application/json"},body:"{}"});
  assert.equal((await verifiedResend.json()).verified,true);
  const [[clock]]=await db.execute("SELECT ABS(TIMESTAMPDIFF(SECOND,starts_at,UTC_TIMESTAMP())) AS drift FROM tenant_subscriptions WHERE tenant_id=?",[result.tenant.id]);
  assert.ok(Number(clock.drift)<30,"New subscription must start on the UTC clock even when the database server uses a different timezone");
  const [[business]]=await db.execute("SELECT activity_code,country_code,currency,region FROM tenant_business_profiles WHERE tenant_id=?",[result.tenant.id]);
  assert.equal(business.activity_code,"grocery");assert.equal(business.country_code,"SA");assert.equal(business.currency,"SAR");assert.equal(business.region,"الرياض");
  assert.equal((await post("/api/auth/register",{...owner,email:"invalid-activity@test.example",slug:"invalid-activity",activity:"unknown"})).status,400);
  assert.equal((await post("/api/auth/register",{...owner,email:"invalid-locale@test.example",slug:"invalid-locale",currency:"USD"})).status,400);
  const [[rejectedProfiles]]=await db.query("SELECT COUNT(*) AS n FROM users WHERE email IN ('invalid-activity@test.example','invalid-locale@test.example')");assert.equal(Number(rejectedProfiles.n),0);
  const [[state]]=await db.execute("SELECT s.status,p.code,(SELECT COUNT(*) FROM branches b WHERE b.tenant_id=s.tenant_id) AS branches,(SELECT COUNT(*) FROM memberships m WHERE m.tenant_id=s.tenant_id AND m.role='owner') AS owners FROM tenant_subscriptions s JOIN package_plans p ON p.id=s.plan_id WHERE s.tenant_id=?",[result.tenant.id]);
  assert.equal(state.status,"active");assert.equal(state.code,"free");assert.equal(Number(state.branches),1);assert.equal(Number(state.owners),1);
  assert.equal((await post("/api/auth/register",owner)).status,409);
  assert.equal((await post("/api/auth/register",{...owner,email:"slug-collision@test.example"})).status,409);
  const [[rollback]]=await db.query("SELECT COUNT(*) AS n FROM users WHERE email='slug-collision@test.example'");assert.equal(Number(rollback.n),0);
  // Existing accounts create the selected activity directly, without admin provisioning.
  const ownerCookie=sessionCookie(created);
  const onboard=(body,cookie=ownerCookie,source=origin)=>fetch(origin+"/api/restaurant/onboard",{method:"POST",headers:{origin:source,"content-type":"application/json",cookie},body:JSON.stringify(body)});
  const input={name:"Additional business",slug:"additional-business",activity:"clothing",countryCode:"AE",currency:"AED",region:"دبي",taxNumber:"123456789",legalAccepted:true};
  assert.equal((await onboard(input,"")).status,401);
  assert.equal((await onboard(input,ownerCookie,"https://foreign.example")).status,403);
  assert.equal((await onboard({...input,legalAccepted:false})).status,400);
  for(const invalid of [{activity:"unknown"},{activity:undefined},{currency:"SAR"},{countryCode:"XX"},{region:"invalid"}])assert.equal((await onboard({...input,...invalid})).status,400);
  const [[before]]=await db.execute("SELECT COUNT(*) AS n FROM memberships WHERE user_id=?",[result.user.id]);assert.equal(Number(before.n),1);
  for(const activity of ["restaurant","cafe","sweets","grocery","clothing","perfume","accessories","watches","gifts","ecommerce","carwash","laundry","automotive","salon","publicworks"]){
   const res=await onboard({...input,activity,slug:"onboard-"+activity});assert.equal(res.status,201,await res.clone().text());const added=await res.json();
   assert.equal(added.activity,activity);assert.ok(added.activityModules.includes("payments"));assert.equal(added.plan,"free");assert.equal(added.tenant.status,"active");
   const [[profile]]=await db.execute("SELECT activity_code,country_code,currency,region,tax_number FROM tenant_business_profiles WHERE tenant_id=?",[added.tenant.id]);
   assert.deepEqual({...profile},{activity_code:activity,country_code:"AE",currency:"AED",region:"دبي",tax_number:"123456789"});
   const [[provisioned]]=await db.execute("SELECT t.kind,m.role,s.status,p.code,(SELECT COUNT(*) FROM branches b WHERE b.tenant_id=t.id) AS branches FROM tenants t JOIN memberships m ON m.tenant_id=t.id JOIN tenant_subscriptions s ON s.tenant_id=t.id JOIN package_plans p ON p.id=s.plan_id WHERE t.id=? AND m.user_id=?",[added.tenant.id,result.user.id]);
   assert.equal(provisioned.kind,["restaurant","cafe","sweets"].includes(activity)?"restaurant":"store");assert.equal(provisioned.role,"owner");assert.equal(provisioned.status,"active");assert.equal(provisioned.code,"free");assert.equal(Number(provisioned.branches),1);
  }
  assert.equal((await onboard({...input,slug:"onboard-clothing"})).status,409);
  const [[after]]=await db.execute("SELECT COUNT(*) AS n FROM memberships WHERE user_id=?",[result.user.id]);assert.equal(Number(after.n),16);
  const [[admins]]=await db.execute("SELECT COUNT(*) AS n FROM platform_admins WHERE user_id=?",[result.user.id]);assert.equal(Number(admins.n),0);
  console.log("Self-service onboarding: all 15 activity profiles, free activation, owner isolation, locale validation and collision rollback verified");
  const customer={email:"http-customer@test.example",password:"a-strong-test-password",name:"Customer",storeSlug:owner.slug,legalAccepted:true};
  assert.equal((await post("/api/customer/register",{...customer,legalAccepted:false})).status,400);
  const registered=await post("/api/customer/register",customer);assert.equal(registered.status,201,await registered.clone().text());
  const customerResult=await registered.json();assert.equal(customerResult.tenantId,result.tenant.id);
  const [[access]]=await db.execute("SELECT (SELECT COUNT(*) FROM memberships WHERE user_id=?) AS staff,(SELECT COUNT(*) FROM tenant_customers WHERE user_id=? AND tenant_id=?) AS customer",[customerResult.user.id,customerResult.user.id,result.tenant.id]);
  assert.equal(Number(access.staff),0);assert.equal(Number(access.customer),1);
  assert.equal((await post("/api/customer/register",customer)).status,409);
  assert.equal((await post("/api/customer/register",{...customer,email:"missing-http@test.example",storeSlug:"missing-http-store"})).status,404);
  await db.execute("UPDATE tenants SET status='suspended' WHERE id=?",[result.tenant.id]);
  assert.equal((await post("/api/customer/register",{...customer,email:"suspended-http@test.example"})).status,404);
  const [[absent]]=await db.query("SELECT COUNT(*) AS n FROM users WHERE email IN ('missing-http@test.example','suspended-http@test.example')");assert.equal(Number(absent.n),0);
 }finally{
  server.kill();await db.end();
 }
});
