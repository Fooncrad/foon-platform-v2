import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {signAuthorizedPullBatch} from "../lib/platform/bidirectional-sync-server-signer.mjs";
import {verifySignedPullBatch} from "../lib/platform/bidirectional-sync-signature.mjs";
import {validatePushReceipt,validatePullBatch} from "../lib/platform/bidirectional-sync-wire-contract.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"];
const hash="a".repeat(64),scope={eventId:ids[0],tenantId:ids[1],branchId:ids[2],digest:hash};
const receipt={ok:true,receipt:{...scope,status:"recorded",nextVersion:1}};
test("push receipt cannot claim success from ok:true alone",()=>{
 assert.throws(()=>validatePushReceipt({ok:true},scope),/SYNC_INVALID_RECEIPT/);
 assert.equal(validatePushReceipt(receipt,scope).status,"unverified");
 assert.equal(validatePushReceipt({...receipt,receipt:{...receipt.receipt,status:"conflict",nextVersion:0}},scope).status,"conflict");
 assert.throws(()=>validatePushReceipt({...receipt,receipt:{...receipt.receipt,status:"conflict",nextVersion:1}},scope),/SYNC_INVALID_RECEIPT/);
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

test("pull rejects cursor regression and over-limit batch before adapter execution",()=>{
 const query={tenantId:ids[1],branchId:ids[2],after:4,limit:1};
 const first={id:5,event_id:ids[0],tenant_id:ids[1],branch_id:ids[2],payload_digest:hash};
 const second={...first,id:6,event_id:ids[2]};
 const payload={ok:true,tenantId:ids[1],branchId:ids[2],nextCursor:6,events:[first,second]};
 assert.throws(()=>validatePullBatch(payload,query),/SYNC_BATCH_SCOPE_MISMATCH/);
 assert.throws(()=>validatePullBatch({...payload,events:[first],nextCursor:3},query),/SYNC_BATCH_SCOPE_MISMATCH/);
});

test("signed pull header and Ed25519 scope accept equivalent UUID casing",()=>{
 const deviceId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 const tenantId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 const branchId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
 const serverScope={deviceId,tenantId,branchId,after:0,limit:100};
 const clientScope={...serverScope,deviceId:deviceId.toUpperCase(),tenantId:tenantId.toUpperCase(),branchId:branchId.toUpperCase()};
 const batch={ok:true,tenantId,branchId,events:[],nextCursor:0};
 const keys=generateKeyPairSync("ed25519");
 const privateKey=keys.privateKey.export({type:"pkcs8",format:"pem"});
 const publicKey=keys.publicKey.export({type:"spki",format:"pem"});
 const signed=signAuthorizedPullBatch({batch,scope:serverScope,privateKey});
 assert.equal(validatePullBatch(signed,clientScope).candidateCursor,0);
 assert.equal(verifySignedPullBatch({batch:signed,scope:clientScope,signature:signed.signature,publicKey}),true);
 for(const changed of [
  {tenantId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd"},
  {branchId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd"}
 ]){
  assert.throws(()=>verifySignedPullBatch({batch:signed,scope:{...clientScope,...changed},signature:signed.signature,publicKey}),/SYNC_BATCH_SCOPE_MISMATCH/);
 }
 assert.throws(()=>verifySignedPullBatch({batch:signed,scope:{...clientScope,deviceId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd"},signature:signed.signature,publicKey}),/SYNC_SIGNATURE_INVALID/);
 assert.throws(()=>verifySignedPullBatch({batch:{...signed,nextCursor:1},scope:clientScope,signature:signed.signature,publicKey}),/SYNC_SIGNATURE_INVALID/);
 assert.throws(()=>signAuthorizedPullBatch({batch,scope:{...serverScope,deviceId:"not-a-uuid"},privateKey}),/SYNC_INVALID_DEVICE/);
});

test("mixed-case signed pull event remains byte-bound to its digest and signature",()=>{
 const deviceId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 const tenantId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 const branchId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
 const scope={deviceId,tenantId,branchId,after:0,limit:100};
 const event={id:1,event_id:deviceId,tenant_id:tenantId.toUpperCase(),branch_id:branchId.toUpperCase(),payload_digest:"a".repeat(64)};
 const batch={ok:true,tenantId,branchId,events:[event],nextCursor:1};
 const keys=generateKeyPairSync("ed25519");
 const privateKey=keys.privateKey.export({type:"pkcs8",format:"pem"});
 const publicKey=keys.publicKey.export({type:"spki",format:"pem"});
 const signed=signAuthorizedPullBatch({batch,scope,privateKey});
 const uppercaseScope={...scope,deviceId:deviceId.toUpperCase(),tenantId:tenantId.toUpperCase(),branchId:branchId.toUpperCase()};
 assert.equal(verifySignedPullBatch({batch:signed,scope:uppercaseScope,signature:signed.signature,publicKey}),true);
 assert.throws(()=>verifySignedPullBatch({batch:{...signed,events:[{...event,payload_digest:"b".repeat(64)}]},scope:uppercaseScope,signature:signed.signature,publicKey}),/SYNC_SIGNATURE_INVALID/);
});

// Strict wire types prevent implicit RegExp coercion from accepting arrays/objects.
test("wire expectations require literal UUID and digest strings",()=>{
 const batch={ok:true,tenantId:ids[1],branchId:ids[2],events:[],nextCursor:0};
 for(const key of ["eventId","tenantId","branchId","digest"]){
  for(const wrap of [value=>[value],value=>({toString:()=>value})]){
   assert.throws(()=>validatePushReceipt(receipt,{...scope,[key]:wrap(scope[key])}),/SYNC_INVALID_EXPECTATION/);
  }
 }
 for(const key of ["tenantId","branchId"]){
  for(const wrap of [value=>[value],value=>({toString:()=>value})]){
   assert.throws(()=>validatePullBatch(batch,{tenantId:ids[1],branchId:ids[2],after:0,[key]:wrap(key==="tenantId"?ids[1]:ids[2])}),/SYNC_INVALID_EXPECTATION/);
  }
 }
 assert.equal(validatePushReceipt(receipt,scope).status,"unverified");
 assert.equal(validatePullBatch(batch,{tenantId:ids[1],branchId:ids[2],after:0}).candidateCursor,0);
});
test("pull rejects non-string event UUIDs and digests with a stable error",()=>{
 const query={tenantId:ids[1],branchId:ids[2],after:0};
 const event={id:1,event_id:ids[0],tenant_id:ids[1],branch_id:ids[2],payload_digest:hash};
 const batch={ok:true,tenantId:ids[1],branchId:ids[2],events:[event],nextCursor:1};
 for(const key of ["event_id","payload_digest"]){
  for(const wrap of [value=>[value],value=>({toString:()=>value})]){
   assert.throws(()=>validatePullBatch({...batch,events:[{...event,[key]:wrap(event[key])}]},query),/SYNC_INVALID_BATCH/);
  }
 }
 assert.equal(validatePullBatch(batch,query).candidateCursor,1);
});
