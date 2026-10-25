import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {signAuthorizedPullBatch} from "../lib/platform/bidirectional-sync-server-signer.mjs";
import {verifySignedPullBatch,pullBatchSignatureMessage} from "../lib/platform/bidirectional-sync-signature.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"];
const scope={deviceId:ids[0],tenantId:ids[1],branchId:ids[2],after:0,limit:10};
const batch={ok:true,tenantId:ids[1],branchId:ids[2],nextCursor:2,events:[{id:2,event_id:ids[0],tenant_id:ids[1],branch_id:ids[2],payload_digest:"a".repeat(64)}]};
test("authorized cloud signer produces locally verifiable batch",()=>{
 const {privateKey,publicKey}=generateKeyPairSync("ed25519");
 const signed=signAuthorizedPullBatch({batch,scope,privateKey:privateKey.export({format:"pem",type:"pkcs8"})});
 assert.equal(verifySignedPullBatch({batch:signed,scope,signature:signed.signature,publicKey:publicKey.export({format:"pem",type:"spki"})}),true);
});
test("signature cannot be replayed for another device or another cursor",()=>{
 const {privateKey,publicKey}=generateKeyPairSync("ed25519");
 const signed=signAuthorizedPullBatch({batch,scope,privateKey:privateKey.export({format:"pem",type:"pkcs8"})});
 const key=publicKey.export({format:"pem",type:"spki"});
 assert.throws(()=>verifySignedPullBatch({batch:signed,scope:{...scope,deviceId:ids[2]},signature:signed.signature,publicKey:key}),/SYNC_SIGNATURE_INVALID/);
 assert.throws(()=>verifySignedPullBatch({batch:{...signed,nextCursor:3},scope,signature:signed.signature,publicKey:key}),/SYNC_SIGNATURE_INVALID/);
});
test("invalid signing key is rejected",()=>{
 assert.throws(()=>signAuthorizedPullBatch({batch,scope,privateKey:"foo"}),/SYNC_SIGNING_KEY_REQUIRED/);
});

test("signed pull requires a literal device UUID before encoding",()=>{
 const deviceId=ids[0];
 const coerced=[
  [deviceId],
  {toString:()=>deviceId,toLowerCase:()=>deviceId},
  Object.assign([deviceId],{toLowerCase:()=>deviceId})
 ];
 for(const invalid of coerced){
  assert.throws(()=>pullBatchSignatureMessage(batch,{...scope,deviceId:invalid}),/SYNC_INVALID_DEVICE/);
 }
 assert.ok(Buffer.isBuffer(pullBatchSignatureMessage(batch,scope)));
});
