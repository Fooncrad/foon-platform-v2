import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomBytes,randomUUID} from "node:crypto";
import {syncLocalOutbox} from "./foon-edge-sync-bridge.mjs";
import {signCloudReceipt} from "../lib/platform/edge-sync-receipt-signature.mjs";
test("real SQLite gateway persists offline order and acknowledges only after cloud receipt",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"foon-edge-e2e-"));
 const port=20000+Math.floor(Math.random()*20000);
 const token=randomBytes(32).toString("hex"),ackSecret=randomBytes(32).toString("hex"),signingSecret=randomBytes(32).toString("hex");
 const env={...process.env,FOON_LAN_PORT:String(port),FOON_LAN_TOKEN:token,FOON_EDGE_ACK_SECRET:ackSecret,FOON_EDGE_RECEIPT_SIGNING_KEY:signingSecret,FOON_EDGE_DEVICE_ID:"device-1",FOON_LAN_DB:join(dir,"orders.sqlite")};
 const localUrl="http://127.0.0.1:"+port;
 let child;
 const req=(path,method="GET",body)=>fetch(localUrl+path,{method,headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:body?JSON.stringify(body):undefined});
 async function start(){
  child=spawn(process.execPath,["scripts/foon-lan-sqlite.mjs"],{env,stdio:"ignore"});
  for(let i=0;i<70;i++){try{if((await req("/health")).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}
  throw Error("EDGE_START_FAILED");
 }
 async function stop(){if(!child)return;const proc=child;child=null;await new Promise(resolve=>{proc.once("exit",resolve);proc.kill("SIGTERM");setTimeout(()=>{if(proc.exitCode===null)proc.kill("SIGKILL");},2000).unref();});}
 const config={localUrl,localToken:token,ackSecret,cloudUrl:"https://cloud.example/edge/sync",cloudToken:token,deviceId:"device-1",tenantId:"tenant-1",branchId:"branch-1",signingSecret};
 try{
  await start();
  const id=randomUUID();
  assert.equal((await req("/orders","POST",{id,branchId:"branch-1",items:[{id:"22222222-2222-4222-8222-222222222222",quantity:2}]})).status,201);
  assert.equal((await (await req("/health")).json()).pending,1);
  assert.equal((await req("/orders/"+id+"/status","PATCH",{status:"completed"})).status,409);
  assert.equal((await (await req("/health")).json()).pending,1);
  await stop();
  await start();
  assert.equal((await (await req("/health")).json()).pending,1);
  const offline=await syncLocalOutbox({...config,fetchImpl:async(url,opts)=>new URL(url).hostname==="cloud.example"?Promise.reject(Error("offline")):fetch(url,opts)});
  assert.equal(offline.acked,0);
  assert.equal((await (await req("/health")).json()).pending,1);
  await stop();
  await start();
  assert.equal((await (await req("/health")).json()).pending,1);
  let cloudApplied=0;
  let cloudAttempts=0;
  let failAckOnce=true;
  const seen=new Map();
  const onlineFetch=async(url,opts)=>{
   if(new URL(url).hostname!=="cloud.example"){
    if(new URL(url).pathname==="/outbox/ack"&&failAckOnce){failAckOnce=false;return new Response(null,{status:503});}
    return fetch(url,opts);
   }
   cloudAttempts++;
   const e=JSON.parse(opts.body),key=e.deviceId+":"+e.eventSeq;
   if(!seen.has(key)){
    cloudApplied++;
    seen.set(key,signCloudReceipt({receiptId:randomUUID(),deviceId:e.deviceId,eventSeq:e.eventSeq,orderId:e.orderId,digest:e.digest},signingSecret));
   }
   return new Response(JSON.stringify({receipt:seen.get(key)}),{status:seen.size===cloudApplied?201:200,headers:{"content-type":"application/json"}});
  };
  await assert.rejects(()=>syncLocalOutbox({...config,fetchImpl:onlineFetch}),/LOCAL_ACK_REJECTED/);
  assert.equal((await (await req("/health")).json()).pending,1);
  assert.equal(cloudApplied,1);
  const synced=await syncLocalOutbox({...config,fetchImpl:onlineFetch});
  assert.equal(synced.acked,1);
  assert.equal(cloudAttempts,2);
  assert.equal(cloudApplied,1);
  assert.equal((await (await req("/health")).json()).pending,0);
  const again=await syncLocalOutbox({...config,fetchImpl:onlineFetch});
  assert.equal(again.acked,0);
  assert.equal(cloudApplied,1);
  await stop();await start();
  assert.equal((await (await req("/health")).json()).pending,0);
  assert.equal((await (await req("/orders")).json()).orders.length,1);
 }finally{await stop();await rm(dir,{recursive:true,force:true});}
});
