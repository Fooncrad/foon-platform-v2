import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";

const desktop=dirname(fileURLToPath(import.meta.url));
const [rust,driver,lib]=await Promise.all([
  readFile(join(desktop,"src-tauri","src","native_outbox_readonly.rs"),"utf8"),
  readFile(join(desktop,"w21-native-wal-adversarial.mjs"),"utf8"),
  readFile(join(desktop,"src-tauri","src","lib.rs"),"utf8")
]);

test("W21 detects orphan pending Outbox references instead of silently omitting them",()=>{
  assert.match(rust,/LEFT JOIN events AS e ON e\.seq=o\.event_seq/);
  assert.match(rust,/sqlite3_column_type\(stmt,index\)!=SQLITE_TEXT/);
  assert.match(rust,/W20_EVENT_INVALID_TEXT/);
});

test("W21 detects duplicate event references inside the pending batch",()=>{
  assert.match(rust,/use std::collections::BTreeSet;/);
  assert.match(rust,/let mut seen_event_seqs=BTreeSet::new\(\)/);
  assert.match(rust,/!seen_event_seqs\.insert\(event_seq\)/);
  assert.match(rust,/W21_DUPLICATED_EVENT_REFERENCE/);
});

test("W21 retains bounded SELECT-only and read-only native WinSQLite3 access",()=>{
  assert.match(rust,/SQLITE_OPEN_READONLY \| SQLITE_OPEN_FULLMUTEX/);
  assert.match(rust,/WHERE o\.synced_at IS NULL ORDER BY o\.seq ASC LIMIT 33/);
  assert.match(rust,/MAX_EVENTS:\s*usize = 32/);
  assert.doesNotMatch(rust,/#\[tauri::command\]|sqlite3_exec|sqlite3_bind_|sqlite3_open\(/);
  assert.doesNotMatch(lib,/native_outbox_readonly::read_fixture_pending_fingerprints/);
});

test("W21 fixture integration covers live WAL, corrupt payload, orphan, duplicate and over-limit events",()=>{
  for(const scenario of ["wal","corrupt","orphan","duplicate","limit"]){
    assert(driver.includes('"'+scenario+'"'),scenario);
    assert(rust.includes('"'+scenario+'"'),scenario);
  }
  assert.match(rust,/#\[ignore = "W21 adversarial synthetic-only fixture runner/);
  assert.match(driver,/journal_mode=WAL/);
  assert.match(driver,/PRAGMA wal_autocheckpoint=0/);
  assert.match(driver,/W21_SYNTHETIC_WAL_NOT_PERSISTED/);
});

test("W21 drives the native Rust read while keeping the synthetic WAL connection open",()=>{
  assert.match(driver,/const child=spawnSync\("cargo"/);
  assert.match(driver,/w21_fixture_boundary/);
  assert.match(driver,/--ignored/);
  assert.match(driver,/FOON_W21_TEST_DB_PATH:dbPath/);
  assert.match(driver,/if\(dbHashBefore!==hashFile\(dbPath\)\|\|walHashBefore!==hashFile\(walPath\)\)/);
  assert.match(driver,/if\(db\)db\.close\(\)/);
});

test("W21 cleanup is restricted to its own freshly created temp folder",()=>{
  assert.match(driver,/randomUUID\(\)\.replaceAll\("-",""\)/);
  assert.match(driver,/dirname\(resolved\)!==root/);
  assert.match(driver,/FOON-W20-Fixture-\[0-9a-f\]\{32\}/);
  assert.match(driver,/events\.sqlite-wal/);
  assert.match(driver,/events\.sqlite-shm/);
  assert.match(driver,/W21_CLEANUP_UNKNOWN_ENTRY/);
  assert.doesNotMatch(driver,/FOON_LAN_DB|EDGE_TEST_DATABASE_URL|foon_edge_test|mysql2/);
});
