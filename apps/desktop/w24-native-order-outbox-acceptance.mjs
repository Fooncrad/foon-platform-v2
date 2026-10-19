// W24 only: create isolated empty synthetic SQLite fixtures and let native
// Rust commit or rollback order + event + pending Outbox atomically.
// NO W05/W06 SQLite, original MariaDB, real order or production connection.
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
  throw Error("W24_EXPLICIT_ISOLATED_TEST_FLAG_REQUIRED");
}
if(process.env.FOON_W24_TEST_DB_PATH||process.env.FOON_LAN_DB){
  throw Error("W24_EXISTING_DATABASE_OVERRIDE_FORBIDDEN");
}
const desktop=fileURLToPath(new URL(".",import.meta.url));
const nativeDir=join(desktop,"src-tauri");
const tempRoot=realpathSync(tmpdir());
const prefix="FOON-W24-Fixture-";
const cases=["success","after-order","after-event","after-outbox",
  "wrong-tenant","wrong-branch","wrong-device"];
const inputPayload={
  id:"order-fixture-w24",branchId:"branch-fixture-w24",
  items:[{id:"item-A",quantity:2,expectedUnitCents:950,expectedCurrency:"SAR"}],
  status:"new",createdAt:"2026-10-19T00:00:00.000Z"
};
function createEmptyDb(path){
  const db=new DatabaseSync(path);
  try{
    assert.equal(db.prepare("PRAGMA journal_mode=WAL").get().journal_mode,"wal");
    db.exec([
      "PRAGMA synchronous=FULL;",
      "PRAGMA foreign_keys=ON;",
      "PRAGMA busy_timeout=5000;",
      "CREATE TABLE orders(",
      "id TEXT PRIMARY KEY,branch_id TEXT NOT NULL,payload TEXT NOT NULL,",
      "status TEXT NOT NULL DEFAULT 'new',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);",
      "CREATE TABLE events(",
      "seq INTEGER PRIMARY KEY AUTOINCREMENT,",
      "order_id TEXT NOT NULL REFERENCES orders(id),",
      "kind TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,",
      "device_id TEXT NOT NULL);",
      "CREATE TABLE outbox(",
      "seq INTEGER PRIMARY KEY AUTOINCREMENT,",
      "event_seq INTEGER NOT NULL UNIQUE REFERENCES events(seq),",
      "synced_at TEXT,receipt_id TEXT);",
      "CREATE TABLE scope_lock(",
      "tenant_id TEXT NOT NULL,branch_id TEXT NOT NULL,device_id TEXT NOT NULL,",
      "enabled INTEGER NOT NULL,",
      "UNIQUE(tenant_id,branch_id,device_id));"
    ].join(" "));
    db.prepare("INSERT INTO scope_lock(tenant_id,branch_id,device_id,enabled) VALUES(?,?,?,1)")
      .run("tenant-fixture-w24","branch-fixture-w24","device-fixture-w24");
  }catch(error){db.close();throw error;}
  return db;
}
function listRows(db){
  return {
    orders:db.prepare("SELECT id,branch_id,payload,status FROM orders ORDER BY id").all(),
    events:db.prepare("SELECT seq,order_id,kind,payload,device_id FROM events ORDER BY seq").all(),
    outbox:db.prepare("SELECT seq,event_seq,synced_at,receipt_id FROM outbox ORDER BY seq").all()
  };
}
function removeOwnTemp(folder){
  const real=realpathSync(folder);
  if(dirname(real)!==tempRoot||!/^FOON-W24-Fixture-[a-f0-9]{32}$/.test(basename(real))){
    throw Error("W24_TEMP_CLEANUP_OUT_OF_SCOPE");
  }
  for(const name of readdirSync(real)){
    if(!["orders.sqlite","orders.sqlite-wal","orders.sqlite-shm"].includes(name)) {
      throw Error("W24_TEMP_CLEANUP_UNKNOWN_FILE");
    }
    const f=join(real,name),meta=lstatSync(f);
    if(!meta.isFile()||meta.isSymbolicLink())throw Error("W24_TEMP_CLEANUP_REPARSE_REFUSED");
    unlinkSync(f);
  }
  rmdirSync(real);
}
for(const scenario of cases){
  const folder=join(tempRoot,prefix+randomUUID().replaceAll("-",""));
  mkdirSync(folder,{recursive:false});
  let db=null;
  try{
    const path=join(folder,"orders.sqlite");
    db=createEmptyDb(path);
    const before=listRows(db);
    assert.deepEqual(before,{orders:[],events:[],outbox:[]});
    const outcome=spawnSync("cargo",[
      "test","--offline","--lib","native_order_outbox::tests::atomic_native_order_outbox_case",
      "--","--ignored"
    ],{
      cwd:nativeDir,windowsHide:true,stdio:"inherit",
      env:{
        ...process.env,
        FOON_W24_TEST_CASE:scenario,
        FOON_W24_TEST_DB_PATH:path
      }
    });
    if(outcome.error||outcome.status!==0)throw Error("W24_NATIVE_TEST_FAILED_"+scenario);
    const after=listRows(db);
    if(scenario==="success"){
      assert.equal(after.orders.length,1);
      assert.equal(after.events.length,1);
      assert.equal(after.outbox.length,1);
      assert.equal(after.orders[0].id,"order-fixture-w24");
      assert.equal(after.orders[0].status,"new");
      assert.equal(after.events[0].order_id,after.orders[0].id);
      assert.equal(after.events[0].device_id,"device-fixture-w24");
      assert.equal(after.outbox[0].event_seq,after.events[0].seq);
      assert.equal(after.outbox[0].synced_at,null);
      assert.equal(after.outbox[0].receipt_id,null);
      assert.equal(eventDigest({
        seq:Number(after.events[0].seq),
        order_id:after.events[0].order_id,
        kind:after.events[0].kind,
        payload:JSON.parse(after.events[0].payload)
      }).length,64);
      assert.deepEqual(JSON.parse(after.events[0].payload),inputPayload);
    }else{
      assert.deepEqual(after,before,scenario+" must leave zero partial rows");
    }
    console.log("PASS W24 NATIVE TRANSACTION: "+scenario.toUpperCase());
  }finally{
    if(db)db.close();
    removeOwnTemp(folder);
  }
}
console.log("W24 ALL SEVEN SYNTHETIC ATOMIC ORDER/OUTBOX CASES PASSED");
