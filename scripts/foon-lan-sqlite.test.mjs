import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomBytes,randomUUID} from "node:crypto";

test("SQLite edge stores orders, outbox, and survives restart",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"foon-edge-"));
 const port=18000+Math.floor(Math.random()*24000);
 const token=randomBytes(32).toString("hex");
 const env={...process.env,FOON_LAN_TOKEN:token,FOON_LAN_PORT:String(port),FOON_LAN_DB:join(dir,"edge.sqlite")};
 const base="http://127.0.0.1:"+port;
 let child;
 const request=(path,method="GET",payload,secret=token)=>fetch(base+path,{method,headers:{authorization:"Bearer "+secret,"content-type":"application/json"},body:payload?JSON.stringify(payload):undefined});
 async function start(){
  child=spawn(process.execPath,["scripts/foon-lan-sqlite.mjs"],{env,stdio:"ignore"});
  for(let i=0;i<70;i++){try{if((await request("/health")).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  throw new Error("Edge server failed to start");
 }
 async function stop(){if(!child)return;const p=child;child=undefined;await new Promise(resolve=>{p.once("exit",resolve);p.kill("SIGTERM");setTimeout(()=>{if(p.exitCode===null)p.kill("SIGKILL");},2000).unref();});}
 try{
  await start();
  assert.equal((await request("/orders","GET",undefined,"wrong")).status,401);
  const id=randomUUID(),payload={id,branchId:"branch-1",items:[{id:"item-1",quantity:2}]};
  assert.equal((await request("/orders","POST",payload)).status,201);
  assert.equal((await request("/orders","POST",payload)).status,200);
  assert.equal((await request("/orders/"+id+"/status","PATCH",{status:"preparing"})).status,200);
  const outbox=await (await request("/outbox")).json();
  assert.equal(outbox.events.length,2);
  await stop();
  await start();
  const saved=await (await request("/orders")).json();
  assert.equal(saved.orders.length,1);
  assert.equal(saved.orders[0].status,"preparing");
  const pending=await (await request("/health")).json();
  assert.equal(pending.pending,2);
 }finally{await stop();await rm(dir,{recursive:true,force:true});}
});
