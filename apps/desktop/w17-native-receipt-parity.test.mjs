// W17: pure compatibility and Windows-native source isolation tests.
// All fixture signatures are synthetic; no real device keys or production.
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {createHmac} from "node:crypto";
import {
  signCloudReceipt,
  verifyCloudReceiptSignature
} from "../../lib/platform/edge-sync-receipt-signature.mjs";

const dir=dirname(fileURLToPath(import.meta.url));
const root=join(dir,"src-tauri","src");
const [native,lib] = await Promise.all([
  readFile(join(root,"native_cloud_receipt.rs"),"utf8"),
  readFile(join(root,"lib.rs"),"utf8")
]);
const secret="foon-w17-only-synthetic-device-key-123456789012345";
const receipt={
  receiptId:"receipt-fixture-001",deviceId:"device-fixture",eventSeq:9,
  orderId:"order-fixture",digest:"a".repeat(64)
};
const pinned="e1710acbf388b694869530f7625fba261a49f6130ed678420049e74beca594db";

test("W17 native CNG module compiles Windows-only and has no Tauri / frontend secret command",()=>{
  assert.match(lib,/#\[cfg\(windows\)\]\s*mod native_cloud_receipt;/);
  assert.match(native,/#\!\[cfg\(windows\)\]/);
  assert.match(native,/#\[link\(name = "bcrypt"\)\]/);
  assert.match(native,/BCryptOpenAlgorithmProvider/);
  assert.match(native,/BCRYPT_ALG_HANDLE_HMAC_FLAG/);
  assert.match(native,/BCryptFinishHash/);
  assert.doesNotMatch(native,/#\[tauri::command\]/);
  assert.doesNotMatch(lib,/native_cloud_receipt::verify_signed_cloud_receipt/);
  assert.doesNotMatch(native,/FOON_EDGE_RECEIPT_SIGNING_KEY|FOON_LAN_TOKEN|FOON_LAN_DB/);
});

test("W17 JavaScript canonical HMAC and independent crypto result equal pinned Windows test vector",()=>{
  const canonical=JSON.stringify([
    receipt.receiptId,receipt.deviceId,receipt.eventSeq,
    receipt.orderId,receipt.digest
  ]);
  const expected=createHmac("sha256",secret).update(canonical).digest("hex");
  assert.equal(expected,pinned);
  assert.equal(signCloudReceipt(receipt,secret).signature,pinned);
  assert.equal(verifyCloudReceiptSignature({...receipt,signature:pinned},secret),true);
});

test("W17 JS baseline rejects malformed, weak, mutated signatures",()=>{
  const signed=signCloudReceipt(receipt,secret);
  for(const field of ["receiptId","deviceId","eventSeq","orderId","digest","signature"]){
    const altered={...signed,[field]:field==="eventSeq"?10:field==="digest"?"b".repeat(64):field==="signature"?"f".repeat(64):"forged"};
    assert.equal(verifyCloudReceiptSignature(altered,secret),false,field);
  }
  assert.equal(verifyCloudReceiptSignature(signed,"weak"),false);
  assert.equal(verifyCloudReceiptSignature({...signed,signature:"not-a-signature"},secret),false);
});

test("W17 strict native verifier fails closed on invalid input and uses constant-time compare",()=>{
  assert.match(native,/MAX_SAFE_JS_INTEGER/);
  assert.match(native,/parse_lower_hex_32/);
  assert.match(native,/receipt\.device_id != expected\.device_id/);
  assert.match(native,/receipt\.event_seq != expected\.event_seq/);
  assert.match(native,/receipt\.order_id != expected\.order_id/);
  assert.match(native,/receipt\.digest != expected\.digest/);
  assert.match(native,/constant_time_eq_32\(&supplied, &actual\)/);
  assert.match(native,/NATIVE_RECEIPT_CRYPTO_UNAVAILABLE/);
});
