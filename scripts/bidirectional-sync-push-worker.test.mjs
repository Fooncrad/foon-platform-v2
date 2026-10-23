import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {pushNextPendingSyncEvent} from "../lib/platform/bidirectional-sync-push-worker.mjs";
import {digestChange} from "../lib/platform/bidirectional-sync-contract.mjs";
import {signCommittedPushReceipt} from "../lib/platform/bidirectional-sync-push-receipt.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444"];
const scope={deviceId:ids[0],tenantId:ids[1],branchId:ids[2]};
const change={eventId:ids[3],tenantId:ids[1],branchId:ids[2],actorId:ids[0],entityId:ids[3],entityType:"catalog_item",operation:"upsert",baseVersion:0,timestamp:"2026-10-22T18:00:00Z",payload:{name:"Coffee"}};
const keypair=generateKeyPairSync("ed25519");
const privateKey=keypair.privateKey.export({type:"pkcs8",format:"pem"});
const publicKey=keypair.publicKey.export({type:"spki",format:"pem"});
const authorization="Bearer "+"a".repeat(64),url="https://sync.example.com/api/sync/v1/push";
function fixture({empty=false}={}){
 const calls=[];
 const db={calls,async beginTransaction(){calls.push("begin")},async rollback(){calls.push("rollback")},async commit(){calls.push("commit")},async execute(sql){
 calls.push(sql);
 if(sql.includes("state='conflict'"))return [[]];
 if(sql.startsWith("SELECT event_id,payload_digest,event_payload"))return [empty?[]:[{event_id:change.eventId,payload_digest:digestChange(change),event_payload:JSON.stringify(change)}]];
 if(sql.startsWith("SELECT tenant_id,branch_id,payload_digest,state"))return [[{tenant_id:ids[1],branch_id:ids[2],payload_digest:digestChange(change),state:"pending"}]];
 if(sql.startsWith("SELECT payload_digest,next_version,signature"))return [[]];
 return [{affectedRows:1}];
 }};
 return db;
}
const signedResponse=()=>signCommittedPushReceipt({receipt:{deviceId:ids[0],eventId:ids[3],tenantId:ids[1],branchId:ids[2],digest:digestChange(change),status:"recorded",nextVersion:1},privateKey});
const response=(data)=>({status:200,ok:true,redirected:false,headers:{get:()=>"application/json"},json:async()=>data});
test("one pending event is pushed and acknowledged only after signed receipt",async()=>{
 const db=fixture();let posted;
 const result=await pushNextPendingSyncEvent({db,scope,url,authorization,publicKey,fetchImpl:async(_,opts)=>{posted=JSON.parse(opts.body);return response(signedResponse());}});
 assert.equal(result.status,"acknowledged");assert.deepEqual(posted,{change});
 assert.equal(db.calls.at(-1),"commit");
});
test("network failure leaves pending event untouched",async()=>{
 const db=fixture();
 await assert.rejects(()=>pushNextPendingSyncEvent({db,scope,url,authorization,publicKey,fetchImpl:async()=>{throw Error("OFFLINE");}}),/OFFLINE/);
 assert.ok(!db.calls.includes("begin"));
});
test("wrong receipt does not mark event complete",async()=>{
 const db=fixture();
 await assert.rejects(()=>pushNextPendingSyncEvent({db,scope,url,authorization,publicKey,fetchImpl:async()=>response({ok:true})}),/SYNC_INVALID_RECEIPT/);
 assert.ok(!db.calls.includes("begin"));
});
test("empty queue has no transport side effects",async()=>{
 const db=fixture({empty:true});
 const result=await pushNextPendingSyncEvent({db,scope,url,authorization,publicKey,fetchImpl:async()=>{throw Error("must not connect");}});
 assert.deepEqual(result,{status:"idle"});
});
