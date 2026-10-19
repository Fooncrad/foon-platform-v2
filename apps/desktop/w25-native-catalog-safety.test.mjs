import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const here=dirname(fileURLToPath(import.meta.url));
const [rust,runner,lib]=await Promise.all([
  readFile(join(here,"src-tauri","src","native_order_outbox.rs"),"utf8"),
  readFile(join(here,"w25-native-catalog-acceptance.mjs"),"utf8"),
  readFile(join(here,"src-tauri","src","lib.rs"),"utf8")
]);
test("W25 continues restricting all writes to isolated Windows synthetic Temp SQLite",()=>{
  assert.match(rust,/#!\[cfg\(windows\)\]/);
  assert.match(rust,/FOON-W24-Fixture-/);
  assert.match(rust,/DB_NAME:&str="orders.sqlite"/);
  assert.match(rust,/fs::canonicalize\(std::env::temp_dir\(\)\)/);
  assert.doesNotMatch(rust,/SQLITE_OPEN_CREATE|#\[tauri::command\]|TcpStream/);
  assert.doesNotMatch(lib,/create_synthetic_order_with_catalog_atomic/);
});
test("W25 never trusts input price and verifies against tenant/branch catalog",()=>{
  assert.match(rust,/const RESERVE_CATALOG:&\[u8\]/);
  assert.match(rust,/tenant_id=\? AND branch_id=\? AND item_id=\?/);
  assert.match(rust,/stock_qty>=\? AND unit_cents=\? AND currency=\? AND enabled=1/);
  assert.match(rust,/bind_text\(stmt\.0,2,order\.tenant_id\)/);
  assert.match(rust,/bind_text\(stmt\.0,3,order\.branch_id\)/);
  assert.match(rust,/W25_CATALOG_PRICE_STOCK_OR_ITEM_UNAVAILABLE/);
});
test("W25 reserves stock in SAME BEGIN IMMEDIATE as order, event and Outbox",()=>{
  const begin=rust.indexOf('exec_sql(db.0,b"BEGIN IMMEDIATE\\0")?');
  const catalog=rust.indexOf('reserve_synthetic_catalog(db.0,&order)?');
  const insert=rust.indexOf('let stmt=prepared(db.0,INSERT_ORDER)?');
  const outbox=rust.indexOf('let stmt=prepared(db.0,INSERT_OUTBOX)?');
  const commit=rust.indexOf('exec_sql(db.0,b"COMMIT\\0")?');
  assert(begin>=0&&catalog>begin&&insert>catalog&&outbox>insert&&commit>outbox);
  assert.match(rust,/let _=exec_sql\(self\.0,b"ROLLBACK\\0"\)/);
  assert.match(rust,/PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL/);
});
test("W25 rejects duplicated items, bad quantities, spoofed fields or currencies",()=>{
  assert.match(rust,/let mut seen=HashSet::new\(\)/);
  assert.match(rust,/!seen\.insert\(item_id\)/);
  assert.match(rust,/obj\.len\(\)!=4/);
  assert.match(rust,/\(1\.\.=1000\)\.contains\(&qty\)/);
  assert.match(rust,/currency\.len\(\)!=3/);
  assert.match(rust,/b\.is_ascii_uppercase\(\)/);
  assert.match(rust,/W25_INVALID_ITEMS/);
});
test("W25 new path is opt-in and preserves W24 transaction behavior",()=>{
  assert.match(rust,/pub\(crate\) fn create_synthetic_order_atomic\(/);
  assert.match(rust,/create_order_inner\(db_file,order,injected_failure,false\)/);
  assert.match(rust,/pub\(crate\) fn create_synthetic_order_with_catalog_atomic\(/);
  assert.match(rust,/create_order_inner\(db_file,order,injected_failure,true\)/);
  assert.match(rust,/if enforce_catalog \{/);
});
test("W25 acceptance cases never open production DB and validate stock rollback",()=>{
  const cases=[
    "success","after-catalog","price-changed","missing-item","disabled-item",
    "insufficient-stock","wrong-currency","bad-quantity","duplicate-item",
    "extra-field","mixed-rollback","wrong-tenant","wrong-device"
  ];
  for(const value of cases)assert(runner.includes('"'+value+'"'),value);
  assert.match(runner,/randomUUID\(\)\.replaceAll\("-",""\)/);
  assert.match(runner,/assert\.deepEqual\(after,before/);
  assert.match(runner,/safeRemoveNewFolder\(dir\)/);
  assert.match(runner,/W25_CLEANUP_UNEXPECTED_TEMP_FILE/);
  assert.doesNotMatch(runner,/run-w08|run-w10|Hostinger|mariadb\.exe/);
});
