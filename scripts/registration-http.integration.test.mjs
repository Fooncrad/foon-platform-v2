import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import mysql from "mysql2/promise";

test("production registration routes activate owners and isolate store customers",async()=>{
 const url=new URL(process.env.DATABASE_URL||"");
 assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/foon_migration_test");
 const db=await mysql.createConnection(url.href);
 const origin="http://127.0.0.1:3101";
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3101"],{env:{...process.env,APP_URL:origin},stdio:["ignore","pipe","pipe"]});
 let output="";server.stdout.on("data",chunk=>{output+=chunk;});server.stderr.on("data",chunk=>{output+=chunk;});
 const post=(path,body,source=origin)=>fetch(origin+path,{method:"POST",headers:{"content-type":"application/json",origin:source},body:JSON.stringify(body)});
 try{
  let ready=false;
  for(let i=0;i<60;i++){
   try{await fetch(origin+"/login");ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,500));}
  }
  assert.ok(ready,output);
  const owner={email:"http-owner@test.example",password:"a-strong-test-password",name:"Owner",storeName:"HTTP store",slug:"http-owner-store",kind:"store"};
  assert.equal((await post("/api/auth/register",owner,"https://foreign.example")).status,403);
  assert.equal((await post("/api/auth/register",{...owner,slug:"admin"})).status,400);
  const created=await post("/api/auth/register",owner);assert.equal(created.status,201,await created.clone().text());
  assert.match(created.headers.get("set-cookie")||"",/foon_session=/);
  const result=await created.json();assert.equal(result.plan,"free");assert.equal(result.tenant.status,"active");
  const [[state]]=await db.execute("SELECT s.status,p.code,(SELECT COUNT(*) FROM branches b WHERE b.tenant_id=s.tenant_id) AS branches,(SELECT COUNT(*) FROM memberships m WHERE m.tenant_id=s.tenant_id AND m.role='owner') AS owners FROM tenant_subscriptions s JOIN package_plans p ON p.id=s.plan_id WHERE s.tenant_id=?",[result.tenant.id]);
  assert.equal(state.status,"active");assert.equal(state.code,"free");assert.equal(Number(state.branches),1);assert.equal(Number(state.owners),1);
  assert.equal((await post("/api/auth/register",owner)).status,409);
  assert.equal((await post("/api/auth/register",{...owner,email:"slug-collision@test.example"})).status,409);
  const [[rollback]]=await db.query("SELECT COUNT(*) AS n FROM users WHERE email='slug-collision@test.example'");assert.equal(Number(rollback.n),0);
  const customer={email:"http-customer@test.example",password:"a-strong-test-password",name:"Customer",storeSlug:owner.slug};
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
