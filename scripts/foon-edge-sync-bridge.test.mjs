import test from "node:test";
import assert from "node:assert/strict";
import {syncLocalOutbox} from "./foon-edge-sync-bridge.mjs";
import {signCloudReceipt} from "../lib/platform/edge-sync-receipt-signature.mjs";
import {eventDigest} from "./foon-edge-sync-contract.mjs";

const secret="s".repeat(40),token="t".repeat(40);
const event={seq:1,event_seq:1,order_id:"order-1",kind:"created",payload:{id:"order-1",branchId:"branch-1",items:[{id:"food",quantity:1}]}};
function fakeFetch({tamper=false,offline=false}={}){
 const calls=[],fetchImpl=async(url,options)=>{
  const path=new URL(url).pathname;calls.push(path);
  if(path==="/outbox")return new Response(JSON.stringify({events:[event]}),{status:200});
  if(path==="/edge/sync"){
   if(offline)throw Error("network disconnected");
   const input=JSON.parse(options.body);
   assert.equal(input.deviceId,"device-1");
   assert.equal(input.digest,eventDigest(event));
   const receipt=signCloudReceipt({receiptId:"receipt-1",deviceId:"device-1",eventSeq:1,orderId:"order-1",digest:eventDigest(event)},secret);
   return new Response(JSON.stringify({receipt:tamper?{...receipt,digest:"0".repeat(64)}:receipt}),{status:201});
  }
  if(path==="/outbox/ack")return new Response(JSON.stringify({ok:true}),{status:200});
  throw Error("unexpected path "+path);
 };
 return {calls,fetchImpl};
}
const config={localUrl:"http://127.0.0.1:8787",localToken:token,ackSecret:token,cloudUrl:"https://cloud.example/edge/sync",cloudToken:token,deviceId:"device-1",tenantId:"tenant-1",branchId:"branch-1",signingSecret:secret};
test("bridge confirms only a valid signed cloud receipt",async()=>{
 const {calls,fetchImpl}=fakeFetch();
 const result=await syncLocalOutbox({...config,fetchImpl});
 assert.equal(result.acked,1);assert.deepEqual(calls,["/outbox","/edge/sync","/outbox/ack"]);
});
test("bridge leaves event pending when offline",async()=>{
 const {calls,fetchImpl}=fakeFetch({offline:true});
 const result=await syncLocalOutbox({...config,fetchImpl});
 assert.equal(result.acked,0);assert.equal(result.retry,1);assert.ok(!calls.includes("/outbox/ack"));
});
test("bridge rejects tampered receipt without local ACK",async()=>{
 const {calls,fetchImpl}=fakeFetch({tamper:true});
 const result=await syncLocalOutbox({...config,fetchImpl});
 assert.equal(result.acked,0);assert.equal(result.retry,1);assert.ok(!calls.includes("/outbox/ack"));
});
test("bridge rejects plaintext cloud URLs",async()=>{
 await assert.rejects(()=>syncLocalOutbox({...config,cloudUrl:"http://cloud.example/edge/sync"}),/CLOUD_HTTPS_REQUIRED/);
});
