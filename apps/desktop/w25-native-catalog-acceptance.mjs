// W25 only. Never accepts an existing DB path. Uses 13 UUID-named, disposable
// Windows Temp SQLite fixtures, not W05/W06/MariaDB and not production APIs.
import {DatabaseSync} from "node:sqlite";
import {spawnSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdirSync,realpathSync,readdirSync,lstatSync,unlinkSync,rmdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,dirname,basename} from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
import {eventDigest} from "../../scripts/foon-edge-sync-contract.mjs";
if(process.argv.length!==3||process.argv[2]!=="--run") {
  throw Error("W25_EXPLICIT_SYNTHETIC_ONLY_FLAG_REQUIRED");
}
if(["FOON_LAN_DB","FOON_W24_TEST_DB_PATH","FOON_W25_TEST_DB_PATH"].some(k=>process.env[k])) {
  throw Error("W25_EXISTING_DATABASE_OVERRIDE_REFUSED");
}
const desktop=fileURLToPath(new URL(".",import.meta.url));
const nativeDir=join(desktop,"src-tauri");
const root=realpathSync(tmpdir());
const prefix="FOON-W24-Fixture-";
const cases=[
  "success","after-catalog","price-changed","missing-item","disabled-item",
  "insufficient-stock","wrong-currency","bad-quantity","duplicate-item",
  "extra-field","mixed-rollback","wrong-tenant","wrong-device"
];
function createSynthetic(path,scenario) {
  const db=new DatabaseSync(path);
  try {
    assert.equal(db.prepare("PRAGMA journal_mode=WAL").get().journal_mode,"wal");
    db.exec([
      "PRAGMA synchronous=FULL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;",
      "CREATE TABLE orders(id TEXT PRIMARY KEY,branch_id TEXT NOT NULL,",
      "payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new',",
      "created_at TEXT NOT NULL,updated_at TEXT NOT NULL);",
      "CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT,",
      "order_id TEXT NOT NULL REFERENCES orders(id),kind TEXT NOT NULL,",
      "payload TEXT NOT NULL,created_at TEXT NOT NULL,device_id TEXT NOT NULL);",
      "CREATE TABLE outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT,",
      "event_seq INTEGER NOT NULL UNIQUE REFERENCES events(seq),",
      "synced_at TEXT,receipt_id TEXT);",
      "CREATE TABLE scope_lock(tenant_id TEXT NOT NULL,branch_id TEXT NOT NULL,",
      "device_id TEXT NOT NULL,enabled INTEGER NOT NULL,",
      "UNIQUE(tenant_id,branch_id,device_id));",
      "CREATE TABLE synthetic_catalog(tenant_id TEXT NOT NULL,",
      "branch_id TEXT NOT NULL,item_id TEXT NOT NULL,",
      "unit_cents INTEGER NOT NULL,currency TEXT NOT NULL,",
      "enabled INTEGER NOT NULL,stock_qty INTEGER NOT NULL,",
      "PRIMARY KEY(tenant_id,branch_id,item_id),",
      "CHECK(stock_qty>=0),CHECK(unit_cents>=0));"
    ].join(" "));
    db.prepare(
      "INSERT INTO scope_lock(tenant_id,branch_id,device_id,enabled) VALUES(?,?,?,1)"
    ).run("tenant-fixture-w24","branch-fixture-w24","device-fixture-w24");
    const catalog=db.prepare(
      "INSERT INTO synthetic_catalog(tenant_id,branch_id,item_id,unit_cents,currency,enabled,stock_qty) VALUES(?,?,?,?,?,?,?)"
    );
    if(scenario!=="missing-item"){
      catalog.run("tenant-fixture-w24","branch-fixture-w24","item-A",950,"SAR",
        scenario==="disabled-item"?0:1,
        scenario==="insufficient-stock"?1:10);
    }
    // Verify another tenant's similarly-named item cannot fulfill this order.
    catalog.run("other-tenant","branch-fixture-w24","item-A",950,"SAR",1,100);
    return db;
  }catch(error){db.close();throw error;}
}
function dbSnapshot(db){
  return {
    orders:db.prepare("SELECT id,branch_id,payload,status FROM orders ORDER BY id").all(),
    events:db.prepare("SELECT seq,order_id,kind,payload,device_id FROM events ORDER BY seq").all(),
    outbox:db.prepare("SELECT seq,event_seq,synced_at FROM outbox ORDER BY seq").all(),
    catalog:db.prepare(
      "SELECT tenant_id,branch_id,item_id,unit_cents,currency,enabled,stock_qty FROM synthetic_catalog ORDER BY tenant_id,branch_id,item_id"
    ).all()
  };
}
function safeRemoveNewFolder(folder){
  const real=realpathSync(folder);
  if(dirname(real)!==root||!/^FOON-W24-Fixture-[a-f0-9]{32}$/.test(basename(real))){
    throw Error("W25_CLEANUP_OUTSIDE_SYNTHETIC_TEMP");
  }
  for(const name of readdirSync(real)){
    if(!["orders.sqlite","orders.sqlite-wal","orders.sqlite-shm"].includes(name)){
      throw Error("W25_CLEANUP_UNEXPECTED_TEMP_FILE");
    }
    const full=join(real,name),st=lstatSync(full);
    if(!st.isFile()||st.isSymbolicLink())throw Error("W25_CLEANUP_REPARSE_REFUSED");
    unlinkSync(full);
  }
  rmdirSync(real);
}
for(const scenario of cases){
  const dir=join(root,prefix+randomUUID().replaceAll("-",""));
  mkdirSync(dir,{recursive:false});
  let db;
  try {
    const path=join(dir,"orders.sqlite");
    db=createSynthetic(path,scenario);
    const before=dbSnapshot(db);
    assert.equal(before.orders.length,0);
    assert.equal(before.events.length,0);
    assert.equal(before.outbox.length,0);
    const child=spawnSync("cargo",[
      "test","--offline","--lib",
      "native_order_outbox::tests::w25_native_catalog_order_case",
      "--","--ignored"
    ],{
      cwd:nativeDir,windowsHide:true,stdio:"inherit",
      env:{...process.env,FOON_W25_TEST_CASE:scenario,FOON_W25_TEST_DB_PATH:path}
    });
    if(child.error||child.status!==0)throw Error("W25_NATIVE_RUST_FAILED_"+scenario);
    const after=dbSnapshot(db);
    if(scenario==="success"){
      assert.equal(after.orders.length,1);
      assert.equal(after.events.length,1);
      assert.equal(after.outbox.length,1);
      assert.equal(after.catalog.find(x=>x.tenant_id==="tenant-fixture-w24").stock_qty,8);
      assert.equal(after.catalog.find(x=>x.tenant_id==="other-tenant").stock_qty,100);
      assert.equal(after.outbox[0].event_seq,after.events[0].seq);
      assert.equal(after.outbox[0].synced_at,null);
      const e=after.events[0];
      assert.equal(eventDigest({
        seq:Number(e.seq),order_id:e.order_id,kind:e.kind,
        payload:JSON.parse(e.payload)
      }).length,64);
    } else {
      assert.deepEqual(after,before,"W25 rejection must rollback ALL order/outbox/stock changes: "+scenario);
    }
    console.log("PASS W25 CATALOG/PRICE/STOCK TRANSACTION: "+scenario.toUpperCase());
  } finally {
    if(db)db.close();
    safeRemoveNewFolder(dir);
  }
}
console.log("W25 ALL THIRTEEN SYNTHETIC CATALOG AND STOCK CASES PASSED");
