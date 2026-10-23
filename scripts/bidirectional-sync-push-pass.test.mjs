import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {pushBoundedPendingSyncEvents} from "../lib/platform/bidirectional-sync-push-pass.mjs";
import {digestChange} from "../lib/platform/bidirectional-sync-contract.mjs";
import {signCommittedPushReceipt} from "../lib/platform/bidirectional-sync-push-receipt.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444"];
const scope={deviceId:ids[0],tenantId:ids[1],branchId:ids[2]};
const change={eventId:ids[3],tenantId:ids[1],branchId:ids[2],actorId:ids[0],entityId:ids[3],entityType:"catalog_item",operation:"upsert",baseVersion:0,timestamp:"2026-10-22T18:00:00Z",payload:{name:"Coffee"}};
const keypair=generateKeyPairSync("ed25519"),privateKey=keypair.privateKey.export({type:"pkcs8",format:"pem"}),publicKey=keypair.publicKey.export({type:"spki",format:"pem"});
const params={scope,url:"https://sync.example.com/api/sync/v1/push",authorization:"Bearer "+"a".repeat(64),publicKey};
function fixture({status="recorded",empty=false}={}){
 let state="pending";let sent=0;const calls=[];
 const db={calls,async beginTransaction(){calls.push("begin")},async commit(){calls.push("commit")},async rollback(){calls.push("rollback")},async execute(sql){
  calls.push(sql);
  if(sql.includes("state='conflict'"))return [[]];
  if(sql.startsWith("SELECT event_id,payload_digest,event_payload"))return [empty||state!=="pending"?[]:[{event_id:ids[3],payload_digest:digestChange(change),event_payload:JSON.stringify(change)}]];
  if(sql.startsWith("SELECT tenant_id,branch_id,payload_digest,state"))return [[{tenant_id:ids[1],branch_id:ids[2],payload_digest:digestChange(change),state}]];
  if(sql.startsWith("SELECT payload_digest,next_version,signature"))return [[]];
  if(sql.startsWith("UPDATE foon_sync_pending_events"))state=sql.includes("state='conflict'")?"conflict":"acknowledged";
  return [{affectedRows:1}];
 }};
 const fetchImpl=async()=>{sent++;const data=signCommittedPushReceipt({receipt:{deviceId:ids[0],eventId:ids[3],tenantId:ids[1],branchId:ids[2],digest:digestChange(change),status,nextVersion:status==="conflict"?0:1},privateKey});return {ok:true,status:200,redirected:false,headers:{get:()=>"application/json"},json:async()=>data}};
 return {db,fetchImpl,getSent:()=>sent};
}
test("bounded push acknowledges one item then becomes idle",async()=>{
 const x=fixture();const out=await pushBoundedPendingSyncEvents({...params,db:x.db,fetchImpl:x.fetchImpl});
 assert.equal(out.acknowledged,1);assert.equal(out.conflicts,0);assert.equal(x.getSent(),1);
});
test("conflict is durably held for review and stops push pass",async()=>{
 const x=fixture({status:"conflict"});const out=await pushBoundedPendingSyncEvents({...params,db:x.db,fetchImpl:x.fetchImpl});
 assert.equal(out.status,"review_required");assert.equal(out.conflicts,1);assert.equal(x.getSent(),1);
});
test("invalid push limit cannot send data",async()=>{
 const x=fixture();await assert.rejects(()=>pushBoundedPendingSyncEvents({...params,db:x.db,fetchImpl:x.fetchImpl,maxEvents:101}),/SYNC_INVALID_PUSH_LIMIT/);
 assert.equal(x.getSent(),0);
});
test("offline error propagates without acknowledging",async()=>{
 const x=fixture();await assert.rejects(()=>pushBoundedPendingSyncEvents({...params,db:x.db,fetchImpl:async()=>{throw Error("OFFLINE")}}),/OFFLINE/);
 assert.ok(!x.db.calls.includes("begin"));
});

test("parallel push pass on same device scope is rejected before network",async()=>{
 const x=fixture();let release;const gate=new Promise(resolve=>{release=resolve});let entered;const started=new Promise(resolve=>{entered=resolve});
 const first=pushBoundedPendingSyncEvents({...params,db:x.db,fetchImpl:async()=>{entered();await gate;return x.fetchImpl()}});
 await started;
 await assert.rejects(()=>pushBoundedPendingSyncEvents({...params,db:x.db,fetchImpl:x.fetchImpl}),/SYNC_PUSH_ALREADY_RUNNING/);
 release();await first;assert.equal(x.getSent(),1);
});
test("same-scope lock is released after transport failure",async()=>{
 const x=fixture();
 await assert.rejects(()=>pushBoundedPendingSyncEvents({...params,db:x.db,fetchImpl:async()=>{throw Error("OFFLINE")}}),/OFFLINE/);
 const outcome=await pushBoundedPendingSyncEvents({...params,db:x.db,fetchImpl:x.fetchImpl});
 assert.equal(outcome.acknowledged,1);
});
