import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {once} from "node:events";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomBytes,randomUUID} from "node:crypto";

test("LAN gateway authentication, idempotency and status",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"foon-lan-"));
 const token=randomBytes(32).toString("hex");
 const port=18000+Math.floor(Math.random()*25000);
 const proc=spawn(process.execPath,["scripts/foon-lan-gateway.mjs"],{env:{...process.env,FOON_LAN_TOKEN:token,FOON_LAN_PORT:String(port),FOON_LAN_DATA:join(dir,"orders.json")},stdio:"ignore"});
 const base="http://127.0.0.1:"+port;
 const request=(path,method="GET",data,authorized=true)=>fetch(base+path,{method,headers:{"authorization":authorized?"Bearer "+token:"Bearer invalid","content-type":"application/json"},body:data?JSON.stringify(data):undefined});
 try{
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){try{const r=await request("/health");if(r.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(ready,true,"gateway did not start");
  assert.equal((await request("/orders","GET",undefined,false)).status,401);
  const id=randomUUID(),payload={id,branchId:"branch-1",items:[{id:"item-1",quantity:2}]};
  assert.equal((await request("/orders","POST",payload)).status,201);
  const duplicate=await request("/orders","POST",payload);assert.equal(duplicate.status,200);assert.equal((await duplicate.json()).duplicate,true);
  const status=await request("/orders/"+id+"/status","PATCH",{status:"preparing"});assert.equal(status.status,200);
  const list=await (await request("/orders")).json();assert.equal(list.orders.length,1);assert.equal(list.orders[0].status,"preparing");
  assert.equal((await request("/orders/"+randomUUID()+"/status","PATCH",{status:"ready"})).status,404);
  assert.equal((await request("/orders/"+id+"/status","PATCH",{status:"invalid"})).status,400);
  const afterInvalid=await (await request("/orders")).json();assert.equal(afterInvalid.orders[0].status,"preparing");
  assert.equal((await request("/orders","POST",{...payload,id:randomUUID(),items:[]})).status,400);
  assert.equal((await request("/orders","POST",{...payload,id:randomUUID(),items:[{id:"x"}]},false)).status,401);
  const afterRejected=await (await request("/orders")).json();assert.equal(afterRejected.orders.length,1);
 }finally{proc.kill();await rm(dir,{recursive:true,force:true});}
});

test("LAN gateway restores persisted orders and status after restart",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"foon-lan-restart-"));
 const token=randomBytes(32).toString("hex");
 const port=18000+Math.floor(Math.random()*25000);
 const file=join(dir,"orders.json");
 const base="http://127.0.0.1:"+port;
 const request=(path,method="GET",data)=>fetch(base+path,{method,headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:data?JSON.stringify(data):undefined});
 let proc;
 const start=async()=>{
  proc=spawn(process.execPath,["scripts/foon-lan-gateway.mjs"],{env:{...process.env,FOON_LAN_TOKEN:token,FOON_LAN_PORT:String(port),FOON_LAN_DATA:file},stdio:"ignore"});
  for(let attempt=0;attempt<60;attempt++){
   if(proc.exitCode!==null)throw new Error("LAN gateway exited during startup");
   try{if((await request("/health")).ok)return;}catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error("LAN gateway did not start");
 };
 const stop=async()=>{
  if(proc&&proc.exitCode===null){const exited=once(proc,"exit");proc.kill();await exited;}
 };
 try{
  await start();
  const id=randomUUID(),payload={id,branchId:"branch-restart",items:[{id:"item-1",quantity:1}]};
  assert.equal((await request("/orders","POST",payload)).status,201);
  assert.equal((await request("/orders/"+id+"/status","PATCH",{status:"ready"})).status,200);
  await stop();
  await start();
  const restored=await (await request("/orders")).json();
  assert.equal(restored.orders.length,1);
  assert.equal(restored.orders[0].id,id);
  assert.equal(restored.orders[0].status,"ready");
  const duplicate=await request("/orders","POST",payload);
  assert.equal(duplicate.status,200);
  assert.equal((await duplicate.json()).duplicate,true);
  assert.equal((await (await request("/orders")).json()).orders.length,1);
 }finally{await stop();await rm(dir,{recursive:true,force:true});}
});
