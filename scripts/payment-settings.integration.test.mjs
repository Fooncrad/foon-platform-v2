import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import mysql from "mysql2/promise";
import {countryRegions} from "../lib/tenant/country-catalog.ts";

test("payment settings isolate tenants and branches, hide secrets and reject stale writes",async()=>{
 const url=new URL(process.env.DATABASE_URL||"");
 assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/foon_migration_test");
 const db=await mysql.createConnection(url.href),origin="http://127.0.0.1:3119";
 const vaultKey=randomBytes(32).toString("base64");
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3119"],{env:{...process.env,APP_URL:origin,FOON_PAYMENT_VAULT_KEY:vaultKey},stdio:["ignore","pipe","pipe"]});
 let output="";server.stdout.on("data",chunk=>{output+=chunk;});server.stderr.on("data",chunk=>{output+=chunk;});
 const register=async(activity)=>{
  const suffix=randomUUID().slice(0,8);
  const response=await fetch(origin+"/api/auth/register",{method:"POST",headers:{"content-type":"application/json",origin},body:JSON.stringify({email:"payments-"+suffix+"@test.example",password:"synthetic-long-password-2026",name:"Payment test owner",storeName:"Payment test "+suffix,slug:"payment-test-"+suffix,kind:"store",activity,countryCode:"SA",currency:"SAR",region:countryRegions.SA[0]})});
  assert.equal(response.status,201,await response.clone().text());
  const data=await response.json(),cookie=response.headers.get("set-cookie")?.split(";")[0];assert.ok(cookie);
  return {tenant:data.tenant.id,cookie};
 };
 const request=(owner,method,body,tenant=owner.tenant,source=origin)=>fetch(origin+"/api/restaurant/payments/settings",{method,headers:{cookie:owner.cookie,"x-foon-tenant":tenant,origin:source,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
 try{
  let ready=false;for(let i=0;i<60;i++){try{await fetch(origin+"/login");ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,500));}}
  assert.ok(ready,output);
  const owner=await register("restaurant"),other=await register("salon");
  const [[branch]]=await db.execute("SELECT id FROM branches WHERE tenant_id=? LIMIT 1",[owner.tenant]);
  const [[otherBranch]]=await db.execute("SELECT id FROM branches WHERE tenant_id=? LIMIT 1",[other.tenant]);
  const [[ownerMembership]]=await db.execute("SELECT role,status FROM memberships WHERE tenant_id=? AND user_id=(SELECT user_id FROM auth_sessions WHERE token_hash=SHA2(?,256)) LIMIT 1",[owner.tenant,owner.cookie.split("=")[1]]);
  const payload={branch_id:null,provider:"moyasar",mode:"test",enabled:false,currency:"SAR",merchant_reference:"",public_key:"pk_test_synthetic",version:null,credentials:{secret_key:"sk_test_synthetic",webhook_secret:"synthetic-webhook"}};
  assert.equal((await fetch(origin+"/api/restaurant/payments/settings")).status,401);
  assert.equal((await request(owner,"GET",null,other.tenant)).status,403);
  assert.equal((await request(owner,"PUT",payload,owner.tenant,"https://foreign.example")).status,403);
  assert.equal((await request(owner,"PUT",{...payload,enabled:true})).status,409);
  assert.equal((await request(owner,"PUT",{...payload,mode:"live"})).status,400);
  let saved=await request(owner,"PUT",payload);assert.equal(saved.status,200,await saved.clone().text());assert.equal((await saved.json()).version,1);
  const foreignBranch=await request(owner,"PUT",{...payload,branch_id:otherBranch.id});assert.equal(foreignBranch.status,404,JSON.stringify({response:await foreignBranch.clone().text(),ownerMembership}));
  const get=await request(owner,"GET");assert.equal(get.status,200);const text=await get.text();
  assert.ok(!text.includes("sk_test_synthetic"));assert.ok(!text.includes("synthetic-webhook"));assert.ok(!text.includes("credentials_ciphertext"));
  const data=JSON.parse(text);assert.equal(data.settings[0].status,"configured_pending_integration");assert.equal(data.settings[0].enabled,false);assert.equal(data.electronic_checkout_ready,true);assert.deepEqual(data.supported_checkout,[{provider:"tap",mode:"test"}]);
  const [[stored]]=await db.execute("SELECT credentials_ciphertext FROM tenant_payment_gateway_credentials WHERE tenant_id=? AND scope_key='tenant'",[owner.tenant]);
  assert.ok(stored.credentials_ciphertext.startsWith("v1."));assert.ok(!stored.credentials_ciphertext.includes("sk_test_synthetic"));
  assert.equal((await request(owner,"PUT",payload)).status,409);
  assert.equal((await request(owner,"PUT",{...payload,version:1,credentials:{}})).status,200);
  let settings=(await (await request(owner,"GET")).json()).settings;assert.equal(settings[0].secrets.secret_key,true);
  assert.equal((await request(owner,"PUT",{...payload,version:2,credentials:{},clear_credentials:["webhook_secret"]})).status,200);
  settings=(await (await request(owner,"GET")).json()).settings;assert.equal(settings[0].secrets.webhook_secret,false);assert.ok(settings[0].missing_fields.includes("webhook_secret"));
  assert.equal((await request(owner,"PUT",{...payload,provider:"stripe",mode:"live",public_key:"pk_live_synthetic",version:3,credentials:{}})).status,200);
  settings=(await (await request(owner,"GET")).json()).settings;assert.equal(settings[0].secrets.secret_key,false);
  assert.equal((await request(owner,"PUT",{...payload,branch_id:branch.id,credentials:{},public_key:"",provider:"manual",merchant_reference:"CASH",enabled:true})).status,200);
  settings=(await (await request(owner,"GET")).json()).settings;assert.equal(settings.length,2);assert.equal(settings.find(s=>s.branch_id===branch.id).status,"cash_enabled");assert.equal(settings.find(s=>s.branch_id===null).provider,"stripe");
  const [[user]]=await db.execute("SELECT user_id FROM memberships WHERE tenant_id=? AND role='owner' LIMIT 1",[owner.tenant]);
  await db.execute("UPDATE memberships SET role='accountant' WHERE tenant_id=? AND user_id=?",[owner.tenant,user.user_id]);
  assert.equal((await request(owner,"GET")).status,200);assert.equal((await request(owner,"PUT",{...payload,version:4})).status,403);
  const [audit]=await db.execute("SELECT metadata_json FROM platform_audit_events WHERE target_id=? AND action='tenant.payment_settings.updated'",[owner.tenant]);
  assert.ok(audit.length>0);assert.ok(!JSON.stringify(audit).includes("synthetic"));
 }finally{server.kill();await db.end();}
});
