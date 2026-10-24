import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import mysql from "mysql2/promise";
import {countryRegions} from "../lib/tenant/country-catalog.ts";

// This suite is STRICTLY confined to disposable localhost MariaDB, never production.
test("creator referral: merchant registration -> pending transfer -> verified monthly/yearly commission -> manual payout",async()=>{
 const dbUrl=new URL(process.env.DATABASE_URL||"");
 assert.equal(dbUrl.protocol,"mysql:");
 assert.equal(dbUrl.hostname,"127.0.0.1");
 assert.equal(dbUrl.pathname,"/foon_migration_test");
 const origin="http://127.0.0.1:3158";
 const db=await mysql.createConnection(dbUrl.href);
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p","3158"],{
  env:{...process.env,APP_URL:origin},stdio:["ignore","pipe","pipe"]
 });
 let logs="";server.stdout.on("data",x=>logs+=x);server.stderr.on("data",x=>logs+=x);
 const pwd="synthetic-password-with-strong-length";
 async function req(path,method="GET",body,cookie=""){
  const res=await fetch(origin+path,{method,redirect:"manual",headers:{origin,cookie,"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
  let data;try{data=await res.clone().json();}catch{data=null;}
  return {status:res.status,data,cookie:res.headers.get("set-cookie")?.split(";")[0],text:()=>res.text()};
 }
 async function createMerchant(referralHandle){
  const unique=randomUUID().slice(0,10),slug="ref-test-"+unique;
  const registered=await req("/api/auth/register","POST",{
   name:"Merchant test",storeName:"Referral "+unique,slug,email:slug+"@test.example",
   password:pwd,activity:"grocery",countryCode:"SA",currency:"SAR",region:countryRegions.SA[0],legalAccepted:true,
   ...(referralHandle?{referralHandle}:{})
  });
  assert.equal(registered.status,201,JSON.stringify(registered.data));
  assert.ok(registered.cookie);
  return {cookie:registered.cookie,user:registered.data.user.id,tenant:registered.data.tenant.id,slug};
 }
 try{
  let ready=false;
  for(let i=0;i<75;i++){try{await fetch(origin+"/login",{signal:AbortSignal.timeout(1500)});ready=true;break;}catch{await new Promise(r=>setTimeout(r,400));}}
  assert.ok(ready,logs);
  const admin=await createMerchant();
  await db.execute("INSERT INTO platform_admins(user_id,role,enabled) VALUES (?,'super_admin',TRUE)",[admin.user]);
  const customer=await req("/api/customer/register","POST",{
   name:"Customer creator",email:"creator-ref-"+randomUUID()+"@test.example",password:pwd,storeSlug:admin.slug,legalAccepted:true
  });
  assert.equal(customer.status,201,JSON.stringify(customer.data));
  const creatorCookie=customer.cookie,handle="maker-"+randomUUID().replaceAll("-","").slice(0,14);
  assert.ok(creatorCookie);
  assert.equal((await req("/api/account/creator-profile","PUT",{
   handle,displayName:"Creator Test",bio:"Referral creator",visibility:"private"
  },creatorCookie)).status,200);
  const merchant=await createMerchant(handle);
  const [refs]=await db.execute("SELECT creator_user_id FROM customer_creator_referrals WHERE tenant_id=?",[merchant.tenant]);
  assert.equal(refs.length,1);
  assert.equal(refs[0].creator_user_id,customer.data.user.id);
  const planId=randomUUID(),cyclePrices=[["monthly","200.00"],["yearly","1200.00"]];
  await db.execute("INSERT INTO package_plans(id,code,name_ar,name_en,name_fr) VALUES (?,?,'اختبار أعمال','Business Test','Test entreprise')",
   [planId,"ref-plan-"+randomUUID().slice(0,10)]);
  for(const [cycle,price] of cyclePrices)await db.execute(
   "INSERT INTO package_plan_prices(id,plan_id,billing_cycle,currency,price,enabled) VALUES (?,?,?,'SAR',?,TRUE)",
   [randomUUID(),planId,cycle,price]);
  const ownerPath="/api/tenant/subscription-requests",adminPath="/api/admin/creator-commissions";
  const bankRef="MOCK-"+randomUUID().slice(0,18)+"-";
  assert.equal((await req(ownerPath+"?tenantId="+merchant.tenant,"GET",undefined,creatorCookie)).status,403);
  assert.equal((await req(adminPath,"GET",undefined,merchant.cookie)).status,403);
  const prices=await req(ownerPath+"?tenantId="+merchant.tenant,"GET",undefined,merchant.cookie);
  assert.equal(prices.status,200,JSON.stringify(prices.data));
  assert.ok(prices.data.prices.some(p=>p.plan_id===planId&&p.billing_cycle==="monthly"));
  assert.equal((await req(ownerPath,"POST",{tenantId:merchant.tenant,planId,billingCycle:"monthly",transferReference:bankRef+"A"},creatorCookie)).status,403);
  const saved=await req(ownerPath,"POST",{tenantId:merchant.tenant,planId,billingCycle:"monthly",transferReference:bankRef+"A"},merchant.cookie);
  assert.equal(saved.status,201,JSON.stringify(saved.data));
  assert.equal(saved.data.status,"pending");
  const evidence=new FormData();
  evidence.set("paymentRequestId",saved.data.id);evidence.set("tenantId",merchant.tenant);
  evidence.set("file",new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,...Array(16).fill(0)])],{type:"image/png"}),"receipt.png");
  const evidenceSaved=await fetch(origin+"/api/tenant/subscription-requests/evidence",{method:"POST",headers:{origin,cookie:merchant.cookie},body:evidence});
  assert.equal(evidenceSaved.status,200,await evidenceSaved.clone().text());
  const proofUrl="/api/admin/billing/evidence/"+saved.data.id;
  assert.equal((await fetch(origin+proofUrl,{headers:{cookie:merchant.cookie}})).status,403);
  const proof=await fetch(origin+proofUrl,{headers:{cookie:admin.cookie}});
  assert.equal(proof.status,200);
  assert.match(proof.headers.get("content-disposition")??"",/attachment/);
  assert.match(proof.headers.get("cache-control")??"",/no-store/);

  assert.equal((await req(ownerPath,"POST",{tenantId:merchant.tenant,planId,billingCycle:"monthly",transferReference:bankRef+"B"},merchant.cookie)).status,409);
  assert.equal((await req("/api/account/creator-referrals","GET",undefined,creatorCookie)).data.commissions.length,0);
  const rate=await req(adminPath,"PUT",{percentage:7.5,enabled:true},admin.cookie);
  assert.equal(rate.status,200,JSON.stringify(rate.data));
  const approve=await req("/api/admin/billing","PATCH",{id:saved.data.id,status:"approved",note:"Confirmed bank receipt for test"},admin.cookie);
  assert.equal(approve.status,200,JSON.stringify(approve.data)+"\n"+logs.slice(-8000));
  assert.equal((await fetch(origin+"/api/tenant/subscription-requests/evidence",{method:"POST",headers:{origin,cookie:merchant.cookie},body:evidence})).status,409,"approved payment evidence is immutable");

  assert.equal((await req("/api/admin/billing","PATCH",{id:saved.data.id,status:"approved",note:"Duplicate"},admin.cookie)).status,409);
  let dashboard=await req("/api/account/creator-referrals","GET",undefined,creatorCookie);
  assert.equal(dashboard.status,200);assert.equal(dashboard.data.commissions.length,1);
  assert.equal(String(dashboard.data.commissions[0].amount),"15.00");
  assert.equal(dashboard.data.commissions[0].billing_cycle,"monthly");
  assert.equal(dashboard.data.commissions[0].status,"earned");
  const recordId=dashboard.data.commissions[0].id;
  assert.equal((await req(adminPath,"PATCH",{id:recordId,status:"paid",reference:"BANK-PAID-REF-100"},merchant.cookie)).status,403);
  assert.equal((await req(adminPath,"PATCH",{id:recordId,status:"paid",reference:"BANK-PAID-REF-100"},admin.cookie)).status,200);
  assert.equal((await req(adminPath,"PATCH",{id:recordId,status:"paid",reference:"BANK-PAID-REF-100"},admin.cookie)).status,409);
  assert.equal((await req(ownerPath,"POST",{tenantId:merchant.tenant,planId,billingCycle:"yearly",transferReference:bankRef+"C"},merchant.cookie)).status,201);
  const [next]=await db.execute("SELECT id FROM platform_payment_requests WHERE tenant_id=? AND billing_cycle='yearly' ORDER BY created_at DESC LIMIT 1",[merchant.tenant]);
  assert.equal(next.length,1);
  assert.equal((await req(adminPath,"PUT",{percentage:10,enabled:true},admin.cookie)).status,200);
  assert.equal((await req("/api/admin/billing","PATCH",{id:next[0].id,status:"approved",note:"Confirmed yearly bank transfer"},admin.cookie)).status,200);
  dashboard=await req("/api/account/creator-referrals","GET",undefined,creatorCookie);
  assert.equal(dashboard.data.commissions.length,2);
  const yearly=dashboard.data.commissions.find(r=>r.billing_cycle==="yearly");
  assert.equal(String(yearly.amount),"120.00");
  assert.equal(yearly.commission_basis_points,1000);
  assert.equal(dashboard.data.commissions.find(r=>r.billing_cycle==="monthly").commission_basis_points,750);
  assert.equal((await req(adminPath,"PUT",{percentage:10,enabled:false},admin.cookie)).status,200);
  const [ledger]=await db.execute("SELECT COUNT(*) AS n FROM customer_creator_commissions WHERE tenant_id=?",[merchant.tenant]);
  assert.equal(Number(ledger[0].n),2,"one row per confirmed payment request");
  console.log("PASS verified referrals, paid monthly/yearly ledger, immutable rate, real payout status, tenant protection");
 }finally{server.kill();await db.end();}
});
