import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {signCommittedPushReceipt} from "../lib/platform/bidirectional-sync-push-receipt.mjs";
import {persistVerifiedPushAcknowledgment} from "../lib/platform/bidirectional-sync-push-ack.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444"];
const pair=generateKeyPairSync("ed25519"),privateKey=pair.privateKey.export({type:"pkcs8",format:"pem"}),publicKey=pair.publicKey.export({type:"spki",format:"pem"});
const receipt={deviceId:ids[0],eventId:ids[1],tenantId:ids[2],branchId:ids[3],digest:"a".repeat(64),status:"recorded",nextVersion:1};
const payload=signCommittedPushReceipt({receipt,privateKey}),expected={eventId:ids[1],tenantId:ids[2],branchId:ids[3],digest:receipt.digest};
function dbFixture(existing=[],queued={tenant_id:ids[2],branch_id:ids[3],payload_digest:receipt.digest,state:"pending",acknowledged_version:null}){const calls=[];return {calls,async beginTransaction(){calls.push("begin")},async commit(){calls.push("commit")},async rollback(){calls.push("rollback")},async execute(sql){calls.push(sql);if(sql.startsWith("SELECT tenant_id,branch_id"))return [queued?[queued]:[]];if(sql.startsWith("SELECT payload_digest"))return [existing];return [{affectedRows:1}]}}}
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
 assert.equal(r.status,"conflict");assert.equal(db.calls.at(-1),"commit");
 assert.ok(db.calls.some(x=>x.startsWith("UPDATE foon_sync_pending_events SET state=\'conflict\'")));
 assert.ok(!db.calls.some(x=>x.startsWith("INSERT INTO foon_sync_push_acknowledgments")));
});
test("tampered receipts are rejected before opening a transaction",async()=>{
 const db=dbFixture();const tampered={...payload,receipt:{...payload.receipt,nextVersion:7}};
 await assert.rejects(()=>persistVerifiedPushAcknowledgment({db,payload:tampered,expected,deviceId:ids[0],publicKey}),/SYNC_RECEIPT_SIGNATURE_INVALID/);
 assert.deepEqual(db.calls,[]);
});

test("missing or cross-scope queued event cannot be ACKed",async()=>{
 for(const queued of [null,{tenant_id:ids[3],branch_id:ids[3],payload_digest:receipt.digest,state:"pending"}]){
  const db=dbFixture([],queued);
  await assert.rejects(()=>persistVerifiedPushAcknowledgment({db,payload,expected,deviceId:ids[0],publicKey}),/SYNC_OUTBOX_(EVENT_MISSING|SCOPE_MISMATCH)/);
  assert.equal(db.calls.at(-1),"rollback");
  assert.ok(!db.calls.some(x=>x.startsWith("INSERT INTO foon_sync_push_acknowledgments")));
 }
});
test("outbox update failure rolls back receipt ledger",async()=>{
 const db=dbFixture();const original=db.execute;
 db.execute=async(sql)=>sql.startsWith("UPDATE foon_sync_pending_events")? [{affectedRows:0}]:original(sql);
 await assert.rejects(()=>persistVerifiedPushAcknowledgment({db,payload,expected,deviceId:ids[0],publicKey}),/SYNC_OUTBOX_ACK_UPDATE_FAILED/);
 assert.equal(db.calls.at(-1),"rollback");
});
test("verified duplicate queued ACK is idempotent",async()=>{
 const db=dbFixture([{payload_digest:receipt.digest,next_version:1,signature:payload.receipt.signature}],{tenant_id:ids[2],branch_id:ids[3],payload_digest:receipt.digest,state:"acknowledged",acknowledged_version:1});
 const out=await persistVerifiedPushAcknowledgment({db,payload,expected,deviceId:ids[0],publicKey});
 assert.equal(out.status,"acknowledged");
 assert.ok(!db.calls.some(x=>x.startsWith("UPDATE foon_sync_pending_events")));
});

test("signed conflict refuses to mark an already acknowledged event as conflict",async()=>{
 const conflict=signCommittedPushReceipt({receipt:{...receipt,status:"conflict",nextVersion:0},privateKey});
 const db=dbFixture([],{tenant_id:ids[2],branch_id:ids[3],payload_digest:receipt.digest,state:"acknowledged",acknowledged_version:1});
 await assert.rejects(()=>persistVerifiedPushAcknowledgment({db,payload:conflict,expected,deviceId:ids[0],publicKey}),/SYNC_OUTBOX_ACK_CONFLICT/);
 assert.equal(db.calls.at(-1),"rollback");
});
test("failed conflict persistence rolls back and stays retryable",async()=>{
 const conflict=signCommittedPushReceipt({receipt:{...receipt,status:"conflict",nextVersion:0},privateKey});
 const db=dbFixture();const execute=db.execute.bind(db);
 db.execute=async(sql)=>sql.startsWith("UPDATE foon_sync_pending_events SET state='conflict'")?[{affectedRows:0}]:execute(sql);
 await assert.rejects(()=>persistVerifiedPushAcknowledgment({db,payload:conflict,expected,deviceId:ids[0],publicKey}),/SYNC_OUTBOX_CONFLICT_WRITE_FAILED/);
 assert.equal(db.calls.at(-1),"rollback");
});

test("MariaDB UUID casing does not block signed ACK, but foreign scopes roll back",async()=>{
 const scoped={...receipt,tenantId:"a3333333-3333-4333-8333-333333333333",branchId:"b4444444-4444-4444-8444-444444444444"};
 const signed=signCommittedPushReceipt({receipt:scoped,privateKey});
 const expectedScoped={eventId:scoped.eventId,tenantId:scoped.tenantId,branchId:scoped.branchId,digest:scoped.digest};
 const queued={tenant_id:scoped.tenantId.toUpperCase(),branch_id:scoped.branchId.toUpperCase(),payload_digest:scoped.digest,state:"pending",acknowledged_version:null};
 const db=dbFixture([],queued);
 const result=await persistVerifiedPushAcknowledgment({db,payload:signed,expected:expectedScoped,deviceId:scoped.deviceId,publicKey});
 assert.equal(result.status,"acknowledged");
 assert.equal(db.calls.at(-1),"commit");
 assert.ok(db.calls.some(sql=>sql.startsWith("INSERT INTO foon_sync_push_acknowledgments")));
 for(const override of [{tenant_id:"c3333333-3333-4333-8333-333333333333"},{branch_id:"c4444444-4444-4444-8444-444444444444"},{tenant_id:"not-a-uuid"}]){
  const denied=dbFixture([],{...queued,...override});
  await assert.rejects(()=>persistVerifiedPushAcknowledgment({db:denied,payload:signed,expected:expectedScoped,deviceId:scoped.deviceId,publicKey}),/SYNC_OUTBOX_SCOPE_MISMATCH/);
  assert.equal(denied.calls.at(-1),"rollback");
  assert.ok(!denied.calls.some(sql=>sql.startsWith("INSERT INTO foon_sync_push_acknowledgments")||sql.startsWith("UPDATE foon_sync_pending_events")));
 }
});
