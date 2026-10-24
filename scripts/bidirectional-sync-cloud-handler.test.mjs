import test from "node:test";
import assert from "node:assert/strict";
import {handleAuthenticatedSyncPush} from "../lib/platform/bidirectional-sync-cloud-handler.mjs";
import {verifyCommittedPushReceipt} from "../lib/platform/bidirectional-sync-push-receipt.mjs";
import {generateKeyPairSync} from "node:crypto";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444","55555555-5555-4555-8555-555555555555"];
const change={eventId:ids[4],tenantId:ids[1],branchId:ids[2],actorId:ids[3],entityId:ids[4],entityType:"catalog_item",operation:"upsert",baseVersion:0,timestamp:"2026-10-22T18:00:00Z",payload:{name:"Coffee"}};
const ctx={authenticated:true,enabled:true,revoked:false,suspended:false,expiresAt:"2099-01-01T00:00:00Z",deviceId:ids[0],tenantId:ids[1],branchId:ids[2],actorId:ids[3],grants:["catalog.write"]};
const keys=generateKeyPairSync("ed25519");
const privateKey=keys.privateKey.export({format:"pem",type:"pkcs8"}),publicKey=keys.publicKey.export({format:"pem",type:"spki"});
function fixture(){
 const calls=[];return {calls,async beginTransaction(){calls.push("begin")},async commit(){calls.push("commit")},async rollback(){calls.push("rollback")},async execute(sql){calls.push(sql);if(sql.includes("SELECT payload_digest")||sql.includes("SELECT version"))return [[]];return [{affectedRows:1}]}};
}
test("cloud signs receipt only after committed authorized business mutation",async()=>{
 const db=fixture();const result=await handleAuthenticatedSyncPush({connection:db,authenticateDevice:async()=>ctx,credential:"server-only",change,privateKey,applyBusinessChange:async()=>{db.calls.push("business");return true}});
 assert.equal(db.calls.at(-1),"commit");
 assert.equal(verifyCommittedPushReceipt({payload:result,expected:{eventId:change.eventId,tenantId:change.tenantId,branchId:change.branchId,digest:result.receipt.digest},deviceId:ids[0],publicKey}).status,"verified");
});
test("unverified device context cannot mutate or sign",async()=>{
 const db=fixture();
 await assert.rejects(()=>handleAuthenticatedSyncPush({connection:db,authenticateDevice:async()=>({...ctx,revoked:true}),credential:"revoked",change,privateKey,applyBusinessChange:async()=>true}),/SYNC_DEVICE_DISABLED/);
 assert.deepEqual(db.calls,[]);
});
test("business error never produces signed ACK",async()=>{
 const db=fixture();
 await assert.rejects(()=>handleAuthenticatedSyncPush({connection:db,authenticateDevice:async()=>ctx,credential:"server-only",change,privateKey,applyBusinessChange:async()=>{throw Error("BUSINESS_FAILED")}}),/BUSINESS_FAILED/);
 assert.equal(db.calls.at(-1),"rollback");
});


test("cloud commits order and signs verifiable ACK despite MariaDB UUID display casing",async()=>{
 const scoped={...change,tenantId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",branchId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",actorId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc"};
 const upper={...ctx,deviceId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd".toUpperCase(),tenantId:scoped.tenantId.toUpperCase(),branchId:scoped.branchId.toUpperCase(),actorId:scoped.actorId.toUpperCase()};
 const db=fixture();
 const result=await handleAuthenticatedSyncPush({connection:db,authenticateDevice:async()=>upper,credential:"server-only",change:scoped,privateKey,applyBusinessChange:async()=>{db.calls.push("business");return true}});
 assert.equal(db.calls.at(-1),"commit");
 assert.equal(verifyCommittedPushReceipt({payload:result,expected:{eventId:scoped.eventId,tenantId:scoped.tenantId,branchId:scoped.branchId,digest:result.receipt.digest},deviceId:upper.deviceId.toLowerCase(),publicKey}).status,"verified");
});
