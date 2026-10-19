import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";

const desktop=dirname(fileURLToPath(import.meta.url));
const [native,lib,harness]=await Promise.all([
  readFile(join(desktop,"src-tauri","src","native_order_outbox.rs"),"utf8"),
  readFile(join(desktop,"src-tauri","src","lib.rs"),"utf8"),
  readFile(join(desktop,"w24-native-order-outbox-acceptance.mjs"),"utf8")
]);

test("W24 native order writer is Windows-only and cannot be invoked from WebView",()=>{
  assert.match(native,/#!\[cfg\(windows\)\]/);
  assert.match(lib,/#\[cfg\(windows\)\]\s*mod native_order_outbox;/);
  assert.doesNotMatch(native,/#\[tauri::command\]|reqwest|TcpStream|FOON_LAN_DB/);
  assert.doesNotMatch(lib,/native_order_outbox::create_synthetic_order_atomic/);
});

test("W24 writer rejects all non-synthetic merchant database paths",()=>{
  assert.match(native,/FOON-W24-Fixture-/);
  assert.match(native,/DB_NAME:&str="orders.sqlite"/);
  assert.match(native,/fs::canonicalize\(std::env::temp_dir\(\)\)/);
  assert.match(native,/entry\.file_type\(\)\.is_symlink\(\)/);
  assert.match(native,/SQLITE_OPEN_READWRITE\|SQLITE_OPEN_FULLMUTEX/);
  assert.doesNotMatch(native,/SQLITE_OPEN_CREATE/);
});

test("W24 tenant branch device scope is checked before the first order insert",()=>{
  const scope=native.indexOf("let stmt=prepared(db.0,SCOPE)?");
  const order=native.indexOf("let stmt=prepared(db.0,INSERT_ORDER)?");
  assert(scope>0&&order>scope);
  assert.match(native,/WHERE tenant_id=\? AND branch_id=\? AND device_id=\? AND enabled=1/);
  assert.match(native,/W24_SCOPE_FORBIDDEN/);
  assert.match(native,/W24_ORDER_ID_ALREADY_EXISTS/);
});

test("W24 order created-event and pending outbox use one rollback-protected transaction",()=>{
  assert.match(native,/BEGIN IMMEDIATE\\0/);
  assert.match(native,/ROLLBACK\\0/);
  assert.match(native,/COMMIT\\0/);
  assert.match(native,/INSERT INTO orders\(id,branch_id,payload,status,created_at,updated_at\)/);
  assert.match(native,/INSERT INTO events\(order_id,kind,payload,created_at,device_id\)/);
  assert.match(native,/INSERT INTO outbox\(event_seq,synced_at\) VALUES\(\?,NULL\)/);
  for(const fault of ["AfterOrder","AfterEvent","AfterOutbox"]){
    assert(native.includes(fault));
  }
  assert.match(native,/digest_trusted_event\(TrustedRawEvent/);
});

test("W24 seven acceptance scenarios create only fresh isolated SQLite fixtures",()=>{
  for(const label of ["success","after-order","after-event","after-outbox",
    "wrong-tenant","wrong-branch","wrong-device"]){
    assert(harness.includes('"'+label+'"'),label);
  }
  assert.match(harness,/randomUUID\(\)\.replaceAll\("-",""\)/);
  assert.match(harness,/assert\.deepEqual\(after,before/);
  assert.match(harness,/removeOwnTemp\(folder\)/);
  assert.match(harness,/W24_TEMP_CLEANUP_UNKNOWN_FILE/);
  assert.doesNotMatch(harness,/run-w08|run-w10|mariadb\.exe|Hostinger/);
});

test("W24 does not enable a commercial build bypass or weaken the W11 release gate",async()=>{
  const pkg=JSON.parse(await readFile(join(desktop,"package.json"),"utf8"));
  assert.match(pkg.scripts["desktop:release"],/w11-distribution-audit\.mjs && tauri build/);
  assert.doesNotMatch(native,/#\[tauri::command\]/);
  assert.doesNotMatch(native,/std::env::var\("FOON_LAN_DB"\)/);
});
