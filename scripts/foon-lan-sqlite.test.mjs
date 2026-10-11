import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomBytes,randomUUID} from "node:crypto";
import {eventDigest} from "./foon-edge-sync-contract.mjs";
import {signCloudReceipt} from "../lib/platform/edge-sync-receipt-signature.mjs";

test("SQLite edge stores orders, outbox, and survives restart",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"foon-edge-"));
 const port=18000+Math.floor(Math.random()*24000);
 const token=randomBytes(32).toString("hex");
 const env={...process.env,FOON_LAN_TOKEN:token,FOON_EDGE_ACK_SECRET:randomBytes(32).toString("hex"),FOON_EDGE_RECEIPT_SIGNING_KEY:randomBytes(32).toString("hex"),FOON_EDGE_DEVICE_ID:"device-test",FOON_LAN_PORT:String(port),FOON_LAN_DB:join(dir,"edge.sqlite")};
 const base="http://127.0.0.1:"+port;
 let child;
 const request=(path,method="GET",payload,secret=token)=>fetch(base+path,{method,headers:{authorization:"Bearer "+secret,"x-foon-edge-ack-secret":env.FOON_EDGE_ACK_SECRET,"content-type":"application/json"},body:payload?JSON.stringify(payload):undefined});
 async function start(){
  child=spawn(process.execPath,["scripts/foon-lan-sqlite.mjs"],{env,stdio:"ignore"});
  for(let i=0;i<70;i++){try{if((await request("/health")).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  throw new Error("Edge server failed to start");
 }
 async function stop(){if(!child)return;const p=child;child=undefined;await new Promise(resolve=>{p.once("exit",resolve);p.kill("SIGTERM");setTimeout(()=>{if(p.exitCode===null)p.kill("SIGKILL");},2000).unref();});}
 try{
  await start();
  assert.equal((await request("/orders","GET",undefined,"wrong")).status,401);
  assert.equal((await request("/%ZZ")).status,404);
  assert.equal((await request("/health")).status,200);
  const id=randomUUID(),payload={id,branchId:"branch-1",items:[{id:"item-1",quantity:2}]};
  assert.equal((await request("/orders","POST",payload)).status,201);
  assert.equal((await request("/orders","POST",payload)).status,200);
  assert.equal((await request("/orders","POST",{...payload,items:[{id:"different-item",quantity:1}]})).status,409);
  assert.equal((await request("/orders","POST",{...payload,branchId:"branch-2"})).status,409);
  assert.equal((await request("/orders","POST",{...payload,id:randomUUID(),items:[{id:"item-1",quantity:0}]})).status,400);
  assert.equal((await request("/orders","POST",{...payload,id:randomUUID(),items:[{id:"  ",quantity:1}]})).status,400);
  assert.equal((await request("/orders","POST",{...payload,id:randomUUID(),items:[{id:"item-1",quantity:1001}]})).status,400);
  assert.equal((await (await request("/outbox")).json()).events.length,1);
  assert.equal((await request("/orders/"+id+"/status","PATCH",{status:"preparing"})).status,200);
  assert.equal((await request("/orders/"+id+"/status","PATCH",{status:"preparing"})).status,200);
  assert.equal((await request("/orders/"+id+"/status","PATCH",{status:"not-a-status"})).status,400);
  assert.equal((await request("/orders/"+randomUUID()+"/status","PATCH",{status:"ready"})).status,404);
  assert.equal((await (await request("/outbox")).json()).events.length,2);
  assert.equal((await fetch(base+"/outbox/ack",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({seq:1,orderId:id,receipt:"test-cloud-receipt"})})).status,403);
  const outbox=await (await request("/outbox")).json();
  assert.equal(outbox.events.length,2);
  const signed=(event)=>signCloudReceipt({receiptId:"receipt-"+event.seq,deviceId:env.FOON_EDGE_DEVICE_ID,eventSeq:event.seq,orderId:event.order_id,digest:eventDigest({seq:event.seq,order_id:event.order_id,kind:event.kind,payload:event.payload})},env.FOON_EDGE_RECEIPT_SIGNING_KEY);
  assert.equal((await request("/outbox/ack","POST",{seq:outbox.events[0].seq,orderId:randomUUID(),receipt:signed(outbox.events[0])})).status,404);
  assert.equal((await request("/outbox/ack","POST",{seq:outbox.events[0].seq,orderId:id,receipt:"short"})).status,400);
  assert.equal((await request("/outbox/ack","POST",{seq:999999,orderId:id,receipt:"test-cloud-receipt"})).status,404);
  assert.equal((await (await request("/outbox")).json()).events.length,2);
  assert.equal((await request("/outbox/ack","POST",{seq:outbox.events[0].seq,orderId:id,receipt:{...signed(outbox.events[0]),signature:"0".repeat(64)}})).status,403);
  assert.equal((await request("/outbox/ack","POST",{seq:outbox.events[0].seq,orderId:id,receipt:signed(outbox.events[0])})).status,200);
  assert.equal((await request("/outbox/ack","POST",{seq:outbox.events[0].seq,orderId:id,receipt:"test-cloud-receipt"})).status,200);
  await stop();
  await start();
  const saved=await (await request("/orders")).json();
  assert.equal(saved.orders.length,1);
  assert.equal(saved.orders[0].status,"preparing");
  const pending=await (await request("/health")).json();
  assert.equal(pending.pending,1);
  const remaining=await (await request("/outbox")).json();
  assert.equal(remaining.events.length,1);
  assert.equal(remaining.events[0].kind,"status");
  assert.equal(remaining.events[0].order_id,id);
  assert.equal((await request("/outbox/ack","POST",{seq:outbox.events[0].seq,orderId:id,receipt:"test-cloud-receipt"})).status,200);
  assert.equal((await (await request("/health")).json()).pending,1);
  assert.equal((await request("/outbox/ack","POST",{seq:remaining.events[0].seq,orderId:id,receipt:signed(remaining.events[0])})).status,200);
  assert.equal((await (await request("/health")).json()).pending,0);
  await stop();
  await start();
  assert.equal((await (await request("/outbox")).json()).events.length,0);
  assert.equal((await (await request("/health")).json()).pending,0);
 }finally{await stop();await rm(dir,{recursive:true,force:true});}
});
