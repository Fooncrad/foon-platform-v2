import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const desktop=dirname(fileURLToPath(import.meta.url));
const [rust,driver,lib]=await Promise.all([
  readFile(join(desktop,"src-tauri","src","native_order_outbox.rs"),"utf8"),
  readFile(join(desktop,"w26-catalog-lease-adversarial.mjs"),"utf8"),
  readFile(join(desktop,"src-tauri","src","lib.rs"),"utf8")
]);

test("W26 only opens previously created OS-temp synthetic SQLite fixtures",()=>{
  assert.match(rust,/FOON-W24-Fixture-/);
  assert.match(rust,/fs::canonicalize\(std::env::temp_dir\(\)\)/);
  assert.match(rust,/SQLITE_OPEN_READWRITE\|SQLITE_OPEN_FULLMUTEX/);
  assert.doesNotMatch(rust,/SQLITE_OPEN_CREATE|#\[tauri::command\]/);
  assert.doesNotMatch(lib,/create_synthetic_order_with_catalog_lease_atomic/);
});
test("W26 checks tenant, branch, device, revision, enabled and bounded lease validity",()=>{
  assert.match(rust,/const CHECK_LEASE:&\[u8\]=b"SELECT 1 FROM synthetic_catalog_lease/);
  assert.match(rust,/tenant_id=\? AND branch_id=\? AND device_id=\? AND revision=\?/);
  assert.match(rust,/enabled=1 AND issued_at_unix<=\? AND expires_at_unix>\?/);
  assert.match(rust,/expires_at_unix>issued_at_unix/);
  assert.match(rust,/expires_at_unix-issued_at_unix<=86400/);
  assert.match(rust,/W26_CATALOG_LEASE_MISSING_EXPIRED_OR_WRONG_SCOPE/);
});
test("W26 uses native system time, not caller-supplied frontend time",()=>{
  assert.match(rust,/SystemTime::now\(\)\.duration_since\(UNIX_EPOCH\)/);
  assert.match(rust,/i64::try_from\(now\.as_secs\(\)\)/);
  assert.match(rust,/seconds<=0\|\|seconds>MAX_JS_SAFE/);
  assert.doesNotMatch(rust,/std::env::var\("FOON_W26_NOW"/);
});
test("W26 checks catalog lease in same transaction before reserving stock",()=>{
  const begin=rust.indexOf('exec_sql(db.0,b"BEGIN IMMEDIATE\\0")?');
  const lease=rust.indexOf('validate_synthetic_catalog_lease(db.0,&order,revision)?');
  const reserve=rust.indexOf('reserve_synthetic_catalog(db.0,&order)?');
  const insert=rust.indexOf('let stmt=prepared(db.0,INSERT_ORDER)?');
  const commit=rust.indexOf('exec_sql(db.0,b"COMMIT\\0")?');
  assert(begin>=0&&lease>begin&&reserve>lease&&insert>reserve&&commit>insert);
  assert.match(rust,/ROLLBACK\\0/);
  assert.match(rust,/if matches!\(injected_failure,FaultPoint::AfterCatalog\)/);
});
test("W26 is opt-in and preserves W24 and W25 paths without forcing a lease",()=>{
  assert.match(rust,/create_order_inner\(db_file,order,injected_failure,false,None\)/);
  assert.match(rust,/create_order_inner\(db_file,order,injected_failure,true,None\)/);
  assert.match(rust,/create_order_inner\(db_file,order,injected_failure,true,Some\(catalog_revision\)\)/);
});
test("W26 eleven real SQLite fixture scenarios verify rollback and scope",()=>{
  for(const scenario of ["success","after-catalog","expired","future",
    "wrong-revision","disabled-lease","missing-lease","overlong-lease",
    "wrong-tenant","wrong-branch","wrong-device"]){
    assert(driver.includes('"'+scenario+'"'),scenario);
  }
  assert.match(driver,/randomUUID\(\)\.replaceAll\("-",""\)/);
  assert.match(driver,/assert\.deepEqual\(after,before/);
  assert.match(driver,/removeOwnTemp\(dir\)/);
  assert.match(driver,/W26_CLEANUP_UNKNOWN_ENTRY/);
  assert.doesNotMatch(driver,/run-w08|run-w10|mariadb\.exe|Hostinger/);
});
test("W26 source is explicit that a local lease is not cryptographically authoritative",()=>{
  assert.match(rust,/NOT cryptographically signed/);
  assert.match(rust,/server-authenticated revocable snapshots/);
  assert.doesNotMatch(driver,/https?:\/\//);
});
