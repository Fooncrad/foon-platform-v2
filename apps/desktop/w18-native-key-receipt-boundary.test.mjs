import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";

const desktop=dirname(fileURLToPath(import.meta.url));
const root=join(desktop,"src-tauri","src");
const [implementation,lib,dpapi,cng]=await Promise.all([
  readFile(join(root,"protected_receipt_path.rs"),"utf8"),
  readFile(join(root,"lib.rs"),"utf8"),
  readFile(join(root,"windows_secret_store.rs"),"utf8"),
  readFile(join(root,"native_cloud_receipt.rs"),"utf8")
]);

test("W18 compiles only in Windows native Rust and has no WebView command",()=>{
  assert.match(implementation,/#!\[cfg\(windows\)\]/);
  assert.match(lib,/#\[cfg\(windows\)\]\s*mod protected_receipt_path;/);
  assert.doesNotMatch(implementation,/#\[tauri::command\]/);
  assert.doesNotMatch(lib,/protected_receipt_path::verify_receipt_with_protected_device_key/);
});

test("W18 verifies receipt with DPAPI-unwrapped native-only scoped device credential",()=>{
  assert.match(implementation,/use crate::windows_secret_store::\{unseal, SealedDeviceSecret\}/);
  assert.match(implementation,/use crate::native_cloud_receipt::\{verify_signed_cloud_receipt, ExpectedEvent\}/);
  assert.match(implementation,/let plaintext = match unseal\(encrypted_device_key\)/);
  assert.match(implementation,/verify_signed_cloud_receipt\(/);
  assert.match(implementation,/plaintext\.bytes\(\)/);
  assert.match(dpapi,/impl Drop for DeviceSecret/);
  assert.match(dpapi,/secure_zero\(&mut self\.0\)/);
  assert.match(cng,/constant_time_eq_32\(&supplied, &actual\)/);
});

test("W18 never stores keys or sends them to a browser/network/disk",()=>{
  assert.doesNotMatch(implementation,/std::fs::|File::create|OpenOptions|reqwest|TcpStream|http::|println!|eprintln!|env::|log::|tracing::/);
  assert.doesNotMatch(implementation,/FOON_LAN_DB|FOON_EDGE_RECEIPT_SIGNING_KEY|FOON_LAN_TOKEN/);
  assert.doesNotMatch(implementation,/\bACK\s*\(/);
  assert.doesNotMatch(implementation,/\bwrite\s*\(/);
});

test("W18 native tests exercise valid, forged, damaged and oversized receipts",()=>{
  for(const name of [
    "dpapi_unseal_then_cng_verify_accepts_only_original_test_receipt",
    "signed_receipt_tampering_fails_closed_after_native_dpapi_unseal",
    "unrelated_or_damaged_windows_key_never_authorizes_receipt",
    "malformed_or_oversized_input_never_returns_ack_authorization"
  ])assert(implementation.includes("fn "+name+"()"),name);
  assert.match(implementation,/signed_receipt_json\.len\(\) > 8192/);
  assert.match(implementation,/Err\(_\) => return false/);
});
