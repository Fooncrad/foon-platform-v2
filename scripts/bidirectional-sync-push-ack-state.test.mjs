import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {signCommittedPushReceipt} from "../lib/platform/bidirectional-sync-push-receipt.mjs";
import {persistVerifiedPushAcknowledgment} from "../lib/platform/bidirectional-sync-push-ack.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444"];
const keys=generateKeyPairSync("ed25519");
const privateKey=keys.privateKey.export({type:"pkcs8",format:"pem"});
const publicKey=keys.publicKey.export({type:"spki",format:"pem"});
const receipt={deviceId:ids[0],eventId:ids[1],tenantId:ids[2],branchId:ids[3],digest:"a".repeat(64),status:"conflict",nextVersion:0};
const payload=signCommittedPushReceipt({receipt,privateKey});
const expected={eventId:receipt.eventId,tenantId:receipt.tenantId,branchId:receipt.branchId,digest:receipt.digest};
function fixture(state){
 const calls=[];
 const db={calls,async beginTransaction(){calls.push("begin")},async commit(){calls.push("commit")},async rollback(){calls.push("rollback")},async execute(sql){calls.push(sql);if(sql.startsWith("SELECT tenant_id"))return [[{tenant_id:ids[2],branch_id:ids[3],payload_digest:receipt.digest,state,acknowledged_version:null}]];if(sql.startsWith("SELECT payload_digest"))return [[]];return [{affectedRows:1}];}};
 return db;
}
test("signed conflict marks pending event and commits",async()=>{
 const db=fixture("pending");
 const result=await persistVerifiedPushAcknowledgment({db,payload,expected,deviceId:ids[0],publicKey});
 assert.equal(result.status,"conflict");
 assert.equal(db.calls.at(-1),"commit");
 assert.ok(db.calls.some(x=>x.startsWith("UPDATE foon_sync_pending_events SET state='conflict'")));
});
test("replayed signed conflict leaves already-conflicted event unchanged",async()=>{
 const db=fixture("conflict");
 const result=await persistVerifiedPushAcknowledgment({db,payload,expected,deviceId:ids[0],publicKey});
 assert.equal(result.status,"conflict");
 assert.equal(db.calls.at(-1),"commit");
 assert.ok(!db.calls.some(x=>x.startsWith("UPDATE ")));
});
test("signed conflict rejects invalid persisted queue state without committing",async()=>{
 const db=fixture("unexpected");
 await assert.rejects(()=>persistVerifiedPushAcknowledgment({db,payload,expected,deviceId:ids[0],publicKey}),/SYNC_OUTBOX_INVALID_STATE/);
 assert.equal(db.calls.at(-1),"rollback");
 assert.ok(!db.calls.includes("commit"));
 assert.ok(!db.calls.some(x=>x.startsWith("UPDATE ")));
});
test("signed successful ACK still commits pending state and receipt ledger",async()=>{
 const success=signCommittedPushReceipt({receipt:{...receipt,status:"recorded",nextVersion:1},privateKey});
 const db=fixture("pending");
 const result=await persistVerifiedPushAcknowledgment({db,payload:success,expected,deviceId:ids[0],publicKey});
 assert.equal(result.status,"acknowledged");
 assert.equal(db.calls.at(-1),"commit");
 assert.ok(db.calls.some(x=>x.startsWith("INSERT INTO foon_sync_push_acknowledgments")));
 assert.ok(db.calls.some(x=>x.startsWith("UPDATE foon_sync_pending_events SET state='acknowledged'")));
});
test("signed successful ACK rejects invalid queue state before ledger writes",async()=>{
 const success=signCommittedPushReceipt({receipt:{...receipt,status:"recorded",nextVersion:1},privateKey});
 const db=fixture("unexpected");
 await assert.rejects(()=>persistVerifiedPushAcknowledgment({db,payload:success,expected,deviceId:ids[0],publicKey}),/SYNC_OUTBOX_INVALID_STATE/);
 assert.equal(db.calls.at(-1),"rollback");
 assert.ok(!db.calls.some(x=>x.startsWith("INSERT ")||x.startsWith("UPDATE ")));
});
