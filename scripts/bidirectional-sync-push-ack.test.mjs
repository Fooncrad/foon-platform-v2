import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {signCommittedPushReceipt} from "../lib/platform/bidirectional-sync-push-receipt.mjs";
import {persistVerifiedPushAcknowledgment} from "../lib/platform/bidirectional-sync-push-ack.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444"];
const pair=generateKeyPairSync("ed25519"),privateKey=pair.privateKey.export({type:"pkcs8",format:"pem"}),publicKey=pair.publicKey.export({type:"spki",format:"pem"});
const receipt={deviceId:ids[0],eventId:ids[1],tenantId:ids[2],branchId:ids[3],digest:"a".repeat(64),status:"recorded",nextVersion:1};
const payload=signCommittedPushReceipt({receipt,privateKey}),expected={eventId:ids[1],tenantId:ids[2],branchId:ids[3],digest:receipt.digest};
function dbFixture(existing=[]){const calls=[];return {calls,async beginTransaction(){calls.push("begin")},async commit(){calls.push("commit")},async rollback(){calls.push("rollback")},async execute(sql){calls.push(sql);if(sql.startsWith("SELECT payload_digest"))return [existing];return [{affectedRows:1}]}}}
test("valid receipt is durably recorded before acknowledging",async()=>{
 const db=dbFixture();
 const r=await persistVerifiedPushAcknowledgment({db,payload,expected,deviceId:ids[0],publicKey});
 assert.equal(r.status,"acknowledged");assert.equal(db.calls.at(-1),"commit");
 assert.ok(db.calls.some(x=>x.startsWith("INSERT INTO foon_sync_push_acknowledgments")));
});
test("duplicate signed ACK is idempotent without an insert",async()=>{
 const db=dbFixture([{payload_digest:receipt.digest,next_version:1,signature:payload.receipt.signature}]);
 const r=await persistVerifiedPushAcknowledgment({db,payload,expected,deviceId:ids[0],publicKey});
 assert.equal(r.status,"acknowledged");assert.ok(!db.calls.some(x=>x.startsWith("INSERT INTO foon_sync_push_acknowledgments")));
});
test("conflict receipts never mark a push acknowledged",async()=>{
 const conflict=signCommittedPushReceipt({receipt:{...receipt,status:"conflict"},privateKey});const db=dbFixture();
 const r=await persistVerifiedPushAcknowledgment({db,payload:conflict,expected,deviceId:ids[0],publicKey});
 assert.equal(r.status,"conflict");assert.deepEqual(db.calls,[]);
});
test("tampered receipts are rejected before opening a transaction",async()=>{
 const db=dbFixture();const tampered={...payload,receipt:{...payload.receipt,nextVersion:7}};
 await assert.rejects(()=>persistVerifiedPushAcknowledgment({db,payload:tampered,expected,deviceId:ids[0],publicKey}),/SYNC_RECEIPT_SIGNATURE_INVALID/);
 assert.deepEqual(db.calls,[]);
});
