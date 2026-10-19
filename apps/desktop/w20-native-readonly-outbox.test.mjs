// W20 regression: pure static checks. Windows Rust does actual SQLite read.
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";

const desktop=dirname(fileURLToPath(import.meta.url));
const src=join(desktop,"src-tauri","src");
const [rust,lib,fixture]=await Promise.all([
  readFile(join(src,"native_outbox_readonly.rs"),"utf8"),
  readFile(join(src,"lib.rs"),"utf8"),
  readFile(join(desktop,"w20-temp-outbox-fixture.mjs"),"utf8")
]);

test("W20 Windows-only WinSQLite3 reader has no native or frontend write command",()=>{
  assert.match(rust,/#!\[cfg\(windows\)\]/);
  assert.match(lib,/#\[cfg\(windows\)\]\s*mod native_outbox_readonly;/);
  assert.match(rust,/#\[link\(name = "winsqlite3"\)\]/);
  assert.match(rust,/SQLITE_OPEN_READONLY\s*:\s*c_int\s*=\s*0x00000001/);
  assert.match(rust,/SQLITE_OPEN_READONLY \| SQLITE_OPEN_FULLMUTEX/);
  assert.doesNotMatch(rust,/#\[tauri::command\]|sqlite3_exec|sqlite3_bind_|sqlite3_open\(/);
  assert.doesNotMatch(lib,/native_outbox_readonly::read_fixture_pending_fingerprints/);
});

test("W20 refuses durable merchant data and only admits unique temp fixture",()=>{
  assert.match(rust,/FOON-W20-Fixture-/);
  assert.match(rust,/TEST_DATABASE_FILENAME:\s*&str = "events.sqlite"/);
  assert.match(rust,/fs::canonicalize\(std::env::temp_dir\(\)\)/);
  assert.match(rust,/db_info\.file_type\(\)\.is_symlink\(\)/);
  assert.match(rust,/real_db\.parent\(\)!=Some\(fixture_dir\.as_path\(\)\)/);
  assert.doesNotMatch(rust,/FOON_LAN_DB|FOON_EDGE_RECEIPT_SIGNING_KEY|EDGE_TEST_DATABASE_URL/);
});

test("W20 queries pending events only and hashes the real event_seq not outbox sequence",()=>{
  assert.match(rust,/WHERE o\.synced_at IS NULL ORDER BY o\.seq ASC LIMIT 33/);
  assert.match(rust,/JOIN events AS e ON e\.seq=o\.event_seq/);
  assert.match(rust,/seq:event_seq,order_id:&order_id,kind:&kind,payload_json:&payload/);
  assert.match(rust,/digest_trusted_event\(/);
  assert.match(rust,/MAX_EVENTS:\s*usize = 32/);
  assert.match(rust,/W20_TOO_MANY_PENDING_EVENTS/);
  assert.doesNotMatch(rust,/UPDATE\s+outbox|DELETE\s+FROM|INSERT\s+INTO|DROP\s+TABLE|CREATE\s+TABLE/i);
});

test("W20 fixture is synthetic, created only inside system temp with 3 pending and 1 acknowledged",()=>{
  assert.match(fixture,/randomUUID\(\)\.replaceAll\("-",""\)/);
  assert.match(fixture,/new DatabaseSync\(dbPath\)/);
  assert.match(fixture,/new DatabaseSync\(dbPath,\{readOnly:true\}\)/);
  assert.match(fixture,/index===3\?"2026-10-19T00:01:00.000Z":null/);
  assert.match(fixture,/W20_FIXTURE_CHANGED_OR_INVALID/);
  assert.match(fixture,/W20_FIXTURE_DELETE_REFUSED/);
  assert.doesNotMatch(fixture,/W05|W06|foon_v2_test|foon_edge_test|mysql2/);
});

test("W20 report contains digest but excludes order, payload, device and receipt secrets",()=>{
  assert.match(rust,/pub\(crate\) struct PendingEventFingerprint/);
  assert.match(rust,/outbox_seq:\s*u64/);
  assert.match(rust,/event_seq:\s*u64/);
  assert.match(rust,/digest_hex:\s*String/);
  const fields=rust.match(/pub\(crate\) struct PendingEventFingerprint \{([\s\S]*?)\}/)?.[1]??"";
  assert.doesNotMatch(fields,/order_id|payload|token|secret|device|receipt/);
  assert.match(rust,/read_fixture_pending_fingerprints/);
  assert.match(rust,/W20_EVENT_DIGEST_REJECTED/);
});
