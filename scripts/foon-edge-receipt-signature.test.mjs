import test from "node:test";
import assert from "node:assert/strict";
import {signCloudReceipt,verifyCloudReceiptSignature} from "../lib/platform/edge-sync-receipt-signature.mjs";
test("receipt signature binds cloud receipt to exact device, event and digest",()=>{
 const secret="central-secret-12345678901234567890123456789";
 const receipt={receiptId:"receipt-123",deviceId:"device-a",eventSeq:4,orderId:"order-a",digest:"a".repeat(64)};
 const signed=signCloudReceipt(receipt,secret);
 assert.equal(verifyCloudReceiptSignature(signed,secret),true);
 for(const field of ["receiptId","deviceId","eventSeq","orderId","digest"]){
  const value=field==="eventSeq"?5:field==="digest"?"b".repeat(64):"different-value";
  assert.equal(verifyCloudReceiptSignature({...signed,[field]:value},secret),false);
 }
 assert.equal(verifyCloudReceiptSignature(signed,"wrong-secret-12345678901234567890123456789"),false);
 assert.equal(verifyCloudReceiptSignature({...signed,signature:"0".repeat(64)},secret),false);
 assert.throws(()=>signCloudReceipt(receipt,"short"),/RECEIPT_SIGNING_KEY_REQUIRED/);
});
