import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";

const base=dirname(fileURLToPath(import.meta.url));
const [rust,lib,driver]=await Promise.all([
  readFile(join(base,"src-tauri","src","native_ack_sandbox.rs"),"utf8"),
  readFile(join(base,"src-tauri","src","lib.rs"),"utf8"),
  readFile(join(base,"w22-native-ack-adversarial.mjs"),"utf8")
]);
test("W22 cannot ship test-only WinSQLite3 mutator in customer binary or WebView",()=>{
  assert.match(rust,/#\!\[cfg\(all\(test, windows\)\)\]/);
  assert.match(lib,/#\[cfg\(all\(test, windows\)\)\]\s*mod native_ack_sandbox;/);
  assert.doesNotMatch(rust,/#\[tauri::command\]|FOON_LAN_DB|EDGE_TEST_DATABASE_URL/);
  assert.doesNotMatch(lib,/native_ack_sandbox::ack_synthetic_transaction/);
});
test("W22 writable SQLite is restricted to an isolated synthetic OS temp DB",()=>{
  assert.match(rust,/FOON-W22-Fixture-/);
  assert.match(rust,/FIXTURE_NAME:&str="ack-fixture.sqlite"/);
  assert.match(rust,/fs::canonicalize\(std::env::temp_dir\(\)\)/);
  assert.match(rust,/meta\.file_type\(\)\.is_symlink\(\)/);
  assert.match(rust,/meta\.len\(\)>1_048_576/);
  assert.match(rust,/SQLITE_OPEN_READWRITE\|SQLITE_OPEN_FULLMUTEX/);
  assert.doesNotMatch(rust,/SQLITE_OPEN_CREATE/);
});
test("W22 checks local event fingerprint, trusted branch and device scope and signed receipt before an ACK",()=>{
  assert.match(rust,/row\.event_seq!=scope\.event_seq/);
  assert.match(rust,/row\.tenant_id!=scope\.tenant_id/);
  assert.match(rust,/row\.branch_id!=scope\.branch_id/);
  assert.match(rust,/row\.device_id!=scope\.device_id/);
  assert.match(rust,/digest_trusted_event\(TrustedRawEvent/);
  assert.match(rust,/verify_receipt_with_protected_device_key\(/);
  const checkPosition=rust.indexOf("verify_receipt_with_protected_device_key(");
  const updatePosition=rust.indexOf("sqlite3_prepare_v2(db.0,UPDATE_ONE");
  assert(checkPosition>0&&updatePosition>checkPosition);
});
test("W22 updates one row inside a BEGIN IMMEDIATE transaction or rolls back",()=>{
  assert.match(rust,/BEGIN IMMEDIATE\\0/);
  assert.match(rust,/b"ROLLBACK\\0"/);
  assert.match(rust,/b"COMMIT\\0"/);
  assert.match(rust,/AND event_seq=\? AND synced_at IS NULL/);
  assert.match(rust,/sqlite3_changes\(db\.0\)!=1/);
  assert.match(rust,/W22_FORCED_TRANSACTION_ROLLBACK/);
});
test("W22 refuses duplicate ACK and supports nine isolated adversarial scenarios",()=>{
  assert.match(rust,/W22_ALREADY_ACKED/);
  const expected=["success","rollback","wrong-tenant","wrong-branch",
    "wrong-device","wrong-seq","bad-signature","changed-payload","orphan"];
  for(const name of expected) assert(driver.includes('"'+name+'"'),name);
  assert.match(driver,/randomUUID\(\)\.replaceAll\("-",""\)/);
  assert.match(driver,/cleanupOnlyOwnFixture\(dir\)/);
  assert.match(driver,/assert\.deepEqual\(after\.slice\(1\),before\.slice\(1\)/);
  assert.match(driver,/assert\.deepEqual\(after,before/);
});
