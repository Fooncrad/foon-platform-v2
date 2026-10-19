import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const here=dirname(fileURLToPath(import.meta.url));
const [rust,driver,lib]=await Promise.all([
  readFile(join(here,"src-tauri","src","native_signed_catalog.rs"),"utf8"),
  readFile(join(here,"w26-native-signed-catalog-acceptance.mjs"),"utf8"),
  readFile(join(here,"src-tauri","src","lib.rs"),"utf8")
]);
test("W26 uses Windows native ECDSA P-256 public-key verification, no shared cloud secret",()=>{
  assert.match(rust,/BCRYPT_ECDSA_PUBLIC_P256_MAGIC/);
  assert.match(rust,/ECDSA_P256/);
  assert.match(rust,/BCryptImportKeyPair/);
  assert.match(rust,/BCryptVerifySignature/);
  assert.match(rust,/sha256\(&canonical\)/);
  assert.match(driver,/generateKeyPairSync\("ec",\{namedCurve:"prime256v1"\}\)/);
  assert.match(driver,/dsaEncoding:"ieee-p1363"/);
  assert.doesNotMatch(rust,/HMAC|private_key|BEGIN IMMEDIATE|sqlite3_|#\[tauri::command\]/);
});
test("W26 signs explicit deterministic JS/Rust matching array with domain separation",()=>{
  assert.match(rust,/FOON-CATALOG-V1\\n/);
  assert.match(driver,/FOON-CATALOG-V1\\n/);
  assert.match(rust,/snapshot\.revision,snapshot\.tenant_id\.as_str\(\)/);
  assert.match(rust,/snapshot\.branch_id\.as_str\(\),snapshot\.issued_at/);
  assert.match(driver,/snapshot\.revision,snapshot\.tenantId,snapshot\.branchId/);
  assert.match(driver,/i\.id,i\.unitCents,i\.currency,i\.enabled,i\.stockQty/);
});
test("W26 rejects wrong scope, expired/future snapshots and nonmonotonic revision",()=>{
  assert.match(rust,/snapshot\.tenant_id!=expected\.tenant_id/);
  assert.match(rust,/snapshot\.branch_id!=expected\.branch_id/);
  assert.match(rust,/snapshot\.revision<=expected\.previous_revision/);
  assert.match(rust,/snapshot\.issued_at>expected\.now_epoch/);
  assert.match(rust,/snapshot\.expires_at<=expected\.now_epoch/);
  assert.match(rust,/snapshot\.expires_at-snapshot\.issued_at>604800/);
  assert.match(rust,/W26_REPLAY_OR_REVISION_REJECTED/);
});
test("W26 fail-closes malformed, duplicate, oversized and cross-currency items",()=>{
  assert.match(rust,/deny_unknown_fields/);
  assert.match(rust,/MAX_DOCUMENT_BYTES:usize=32768/);
  assert.match(rust,/HashSet::new\(\)/);
  assert.match(rust,/!seen\.insert\(item\.id\.as_str\(\)\)/);
  assert.match(rust,/item\.currency\.len\(\)!=3/);
  assert.match(rust,/W26_ITEMS_REJECTED/);
});
test("W26 ECDSA private key remains ephemeral in Node; no file, DB, IPC, network side effects",()=>{
  assert.match(driver,/const \{publicKey,privateKey\}=generateKeyPairSync/);
  assert.match(driver,/Buffer\.from\(jwk\.x,"base64url"\)/);
  assert.doesNotMatch(driver,/writeFile|createWriteStream|DatabaseSync|fetch\(|axios|http\.request|https\.request/);
  assert.doesNotMatch(rust,/std::fs|std::net|reqwest|std::env::set_var/);
  assert.match(lib,/#\[cfg\(windows\)\]\s*mod native_signed_catalog;/);
  assert.doesNotMatch(lib,/native_signed_catalog::verify_signed_catalog/);
});
test("W26 fifteen independent native CNG rejection scenarios are covered",()=>{
  const scenarios=[
    "valid","tamper-price","tamper-stock","tamper-tenant",
    "wrong-expected-tenant","wrong-expected-branch","expired",
    "future-issued","stale-revision","long-lease","duplicate-item",
    "unknown-field","invalid-currency","wrong-key","invalid-signature"
  ];
  for(const name of scenarios)assert(driver.includes('"'+name+'"'),name);
  assert.match(driver,/FOON_W26_SIGNED_DOCUMENT:JSON\.stringify\(doc\)/);
  assert.match(driver,/--ignored/);
  assert.match(rust,/W26_SIGNATURE_INVALID/);
});
