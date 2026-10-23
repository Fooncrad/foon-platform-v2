import test from "node:test";
import assert from "node:assert/strict";
import {validatePushReceipt,validatePullBatch} from "../lib/platform/bidirectional-sync-wire-contract.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"];
const hash="a".repeat(64),scope={eventId:ids[0],tenantId:ids[1],branchId:ids[2],digest:hash};
const receipt={ok:true,receipt:{...scope,status:"recorded",nextVersion:1}};
test("push receipt cannot claim success from ok:true alone",()=>{
 assert.throws(()=>validatePushReceipt({ok:true},scope),/SYNC_INVALID_RECEIPT/);
 assert.equal(validatePushReceipt(receipt,scope).status,"unverified");
 assert.equal(validatePushReceipt({...receipt,receipt:{...receipt.receipt,status:"conflict"}},scope).status,"conflict");
});
test("receipt must match event, digest, branch and tenant",()=>{
 for(const k of ["eventId","tenantId","branchId","digest"]){
  assert.throws(()=>validatePushReceipt({...receipt,receipt:{...receipt.receipt,[k]:k==="digest"?"b".repeat(64):ids[0]===receipt.receipt[k]?ids[1]:ids[0]}},scope),/SYNC_RECEIPT_MISMATCH/);
 }
 assert.throws(()=>validatePushReceipt({...receipt,receipt:{...receipt.receipt,nextVersion:0}},scope),/SYNC_INVALID_RECEIPT/);
});
test("pull batch enforces sequential cursor, digest and same scope",()=>{
 const query={tenantId:ids[1],branchId:ids[2],after:5,limit:10};
 const event={id:7,event_id:ids[0],tenant_id:ids[1],branch_id:ids[2],payload_digest:hash};
 const batch={ok:true,tenantId:ids[1],branchId:ids[2],nextCursor:7,events:[event]};
 assert.equal(validatePullBatch(batch,query).candidateCursor,7);
 assert.throws(()=>validatePullBatch({...batch,events:[{...event,branch_id:ids[0]}]},query),/SYNC_BATCH_SCOPE_MISMATCH/);
 assert.throws(()=>validatePullBatch({...batch,events:[event,event]},query),/SYNC_INVALID_BATCH/);
 assert.throws(()=>validatePullBatch({...batch,nextCursor:6},query),/SYNC_INVALID_BATCH/);
 assert.throws(()=>validatePullBatch({...batch,events:[{...event,payload_digest:"x"}]},query),/SYNC_INVALID_BATCH/);
});
test("filtered empty pull advances candidate cursor without falsely claiming application",()=>{
 const query={tenantId:ids[1],branchId:ids[2],after:5,limit:10};
 const batch={ok:true,tenantId:ids[1],branchId:ids[2],nextCursor:9,events:[]};
 assert.deepEqual(validatePullBatch(batch,query),{events:[],candidateCursor:9});
});

test("signed pull batches reject repeated event UUIDs despite increasing journal IDs",()=>{
 const query={tenantId:ids[1],branchId:ids[2],after:4,limit:10};
 const first={id:5,event_id:ids[0],tenant_id:ids[1],branch_id:ids[2],payload_digest:hash};
 const repeated={...first,id:6};
 const payload={ok:true,tenantId:ids[1],branchId:ids[2],nextCursor:6,events:[first,repeated]};
 assert.throws(()=>validatePullBatch(payload,query),/SYNC_DUPLICATE_PULL_EVENT/);
 // Distinct journal event UUIDs remain valid even when IDs are nonconsecutive.
 assert.equal(validatePullBatch({...payload,events:[first,{...repeated,event_id:ids[0].replace("11111111","33333333")}]},query).candidateCursor,6);
});
test("pull replay detection normalizes UUID letter case",()=>{
 const query={tenantId:ids[1],branchId:ids[2],after:4,limit:10};
 const upper="AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
 const first={id:5,event_id:upper,tenant_id:ids[1],branch_id:ids[2],payload_digest:hash};
 const payload={ok:true,tenantId:ids[1],branchId:ids[2],nextCursor:6,events:[first,{...first,id:6,event_id:upper.toLowerCase()}]};
 assert.throws(()=>validatePullBatch(payload,query),/SYNC_DUPLICATE_PULL_EVENT/);
});
