import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {signCommittedPushReceipt,verifyCommittedPushReceipt} from "../lib/platform/bidirectional-sync-push-receipt.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444"];
const receipt={deviceId:ids[0],eventId:ids[1],tenantId:ids[2],branchId:ids[3],digest:"a".repeat(64),status:"recorded",nextVersion:1};
const expected={eventId:ids[1],tenantId:ids[2],branchId:ids[3],digest:receipt.digest};
const keys=generateKeyPairSync("ed25519");
const privateKey=keys.privateKey.export({type:"pkcs8",format:"pem"});
const publicKey=keys.publicKey.export({type:"spki",format:"pem"});
const signOne=(r=receipt)=>signCommittedPushReceipt({receipt:r,privateKey});
test("valid signed receipt provides verified acknowledgment",()=>{
 const signed=signOne();
 assert.equal(verifyCommittedPushReceipt({payload:signed,expected,deviceId:ids[0],publicKey}).status,"verified");
});
test("duplicate receipt is valid but conflict does not acknowledge",()=>{
 assert.equal(verifyCommittedPushReceipt({payload:signOne({...receipt,status:"duplicate"}),expected,deviceId:ids[0],publicKey}).status,"verified");
 assert.equal(verifyCommittedPushReceipt({payload:signOne({...receipt,status:"conflict"}),expected,deviceId:ids[0],publicKey}).status,"conflict");
});
test("tampering status or version invalidates signature",()=>{
 const signed=signOne();
 for(const change of [{status:"duplicate"},{nextVersion:5}]){
  assert.throws(()=>verifyCommittedPushReceipt({payload:{...signed,receipt:{...signed.receipt,...change}},expected,deviceId:ids[0],publicKey}),/SYNC_RECEIPT_SIGNATURE_INVALID/);
 }
});
test("different device, branch or missing signature fails closed",()=>{
 const signed=signOne();
 assert.throws(()=>verifyCommittedPushReceipt({payload:signed,expected,deviceId:ids[1],publicKey}),/SYNC_RECEIPT_DEVICE_MISMATCH/);
 assert.throws(()=>verifyCommittedPushReceipt({payload:{...signed,receipt:{...signed.receipt,signature:undefined}},expected,deviceId:ids[0],publicKey}),/SYNC_RECEIPT_SIGNATURE_REQUIRED/);
 assert.throws(()=>verifyCommittedPushReceipt({payload:signed,expected:{...expected,branchId:ids[0]},deviceId:ids[0],publicKey}),/SYNC_RECEIPT_MISMATCH/);
});


test("signed ACK accepts case-only UUID differences but rejects tampering and foreign scope",()=>{
 const mixed={...receipt,deviceId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",eventId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",tenantId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",branchId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd"};
 const signed=signOne(mixed);
 const upper={eventId:mixed.eventId.toUpperCase(),tenantId:mixed.tenantId.toUpperCase(),branchId:mixed.branchId.toUpperCase(),digest:mixed.digest};
 assert.equal(verifyCommittedPushReceipt({payload:signed,expected:upper,deviceId:mixed.deviceId.toUpperCase(),publicKey}).status,"verified");
 assert.throws(()=>verifyCommittedPushReceipt({payload:signed,expected:{...upper,tenantId:ids[0]},deviceId:mixed.deviceId,publicKey}),/SYNC_RECEIPT_MISMATCH/);
 assert.throws(()=>verifyCommittedPushReceipt({payload:signed,expected:upper,deviceId:ids[0],publicKey}),/SYNC_RECEIPT_DEVICE_MISMATCH/);
 assert.throws(()=>verifyCommittedPushReceipt({payload:{...signed,receipt:{...signed.receipt,tenantId:mixed.tenantId.toUpperCase()}},expected:upper,deviceId:mixed.deviceId,publicKey}),/SYNC_RECEIPT_SIGNATURE_INVALID/);
});
