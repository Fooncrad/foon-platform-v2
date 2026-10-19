// W26 ONLY: eleven isolated, disposable SQLite leases.
// There is no real catalog, merchant inventory, W05/W06 data, cloud or ACK.
import {DatabaseSync} from "node:sqlite";
import {spawnSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdirSync,realpathSync,readdirSync,lstatSync,unlinkSync,rmdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,dirname,basename} from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";

if(process.argv.length!==3||process.argv[2]!=="--run"){
  throw Error("W26_EXPLICIT_TEMP_ONLY_RUN_REQUIRED");
}
if(["FOON_LAN_DB","FOON_W24_TEST_DB_PATH","FOON_W25_TEST_DB_PATH",
    "FOON_W26_TEST_DB_PATH"].some(k=>process.env[k])){
  throw Error("W26_EXISTING_DB_OVERRIDE_REFUSED");
}
const nativeDir=join(fileURLToPath(new URL(".",import.meta.url)),"src-tauri");
const temp=realpathSync(tmpdir());
const prefix="FOON-W24-Fixture-";
const cases=[
  "success","after-catalog","expired","future","wrong-revision",
  "disabled-lease","missing-lease","overlong-lease","wrong-tenant",
  "wrong-branch","wrong-device"
];

function createFixture(dbFile,scenario){
  const db=new DatabaseSync(dbFile);
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
      "branch_id TEXT NOT NULL,item_id TEXT NOT NULL,unit_cents INTEGER NOT NULL,",
      "currency TEXT NOT NULL,enabled INTEGER NOT NULL,stock_qty INTEGER NOT NULL,",
      "PRIMARY KEY(tenant_id,branch_id,item_id),CHECK(stock_qty>=0));",
      "CREATE TABLE synthetic_catalog_lease(tenant_id TEXT NOT NULL,",
      "branch_id TEXT NOT NULL,device_id TEXT NOT NULL,revision TEXT NOT NULL,",
      "issued_at_unix INTEGER NOT NULL,expires_at_unix INTEGER NOT NULL,",
      "enabled INTEGER NOT NULL,",
      "PRIMARY KEY(tenant_id,branch_id,device_id,revision));"
    ].join(" "));
    const addScope=db.prepare(
      "INSERT INTO scope_lock(tenant_id,branch_id,device_id,enabled) VALUES(?,?,?,1)"
    );
    const scopes=[
      ["tenant-fixture-w24","branch-fixture-w24","device-fixture-w24"],
      ["other-tenant","branch-fixture-w24","device-fixture-w24"],
      ["tenant-fixture-w24","other-branch","device-fixture-w24"],
      ["tenant-fixture-w24","branch-fixture-w24","other-device"]
    ];
    for(const entry of scopes)addScope.run(...entry);
    const addCatalog=db.prepare(
      "INSERT INTO synthetic_catalog(tenant_id,branch_id,item_id,unit_cents,currency,enabled,stock_qty) VALUES(?,?,?,950,'SAR',1,10)"
    );
    addCatalog.run("tenant-fixture-w24","branch-fixture-w24","item-A");
    addCatalog.run("other-tenant","branch-fixture-w24","item-A");
    addCatalog.run("tenant-fixture-w24","other-branch","item-A");

    if(scenario!=="missing-lease"){
      const now=Math.floor(Date.now()/1000);
      let issued=now-60,expires=now+3600;
      if(scenario==="expired"){issued=now-3600;expires=now-1;}
      if(scenario==="future"){issued=now+600;expires=now+3600;}
      if(scenario==="overlong-lease"){issued=now-60;expires=now+86500;}
      db.prepare(
        "INSERT INTO synthetic_catalog_lease(tenant_id,branch_id,device_id,revision,issued_at_unix,expires_at_unix,enabled) VALUES(?,?,?,?,?,?,?)"
      ).run("tenant-fixture-w24","branch-fixture-w24","device-fixture-w24",
        "rev-fixture-26",issued,expires,scenario==="disabled-lease"?0:1);
    }
    return db;
  }catch(err){db.close();throw err;}
}
function snapshot(db){
  return {
    orders:db.prepare("SELECT id,branch_id,payload,status FROM orders ORDER BY id").all(),
    events:db.prepare("SELECT seq,order_id,payload FROM events ORDER BY seq").all(),
    outbox:db.prepare("SELECT seq,event_seq,synced_at FROM outbox ORDER BY seq").all(),
    catalog:db.prepare("SELECT tenant_id,branch_id,item_id,stock_qty FROM synthetic_catalog ORDER BY tenant_id,branch_id,item_id").all(),
    leases:db.prepare("SELECT tenant_id,branch_id,device_id,revision,enabled,issued_at_unix,expires_at_unix FROM synthetic_catalog_lease ORDER BY tenant_id,branch_id,device_id,revision").all()
  };
}
function removeOwnTemp(dir){
  const real=realpathSync(dir);
  if(dirname(real)!==temp||!/^FOON-W24-Fixture-[0-9a-f]{32}$/.test(basename(real))){
    throw Error("W26_CLEANUP_OUTSIDE_FRESH_TEMP_FOLDER");
  }
  for(const name of readdirSync(real)){
    if(!["orders.sqlite","orders.sqlite-wal","orders.sqlite-shm"].includes(name)){
      throw Error("W26_CLEANUP_UNKNOWN_ENTRY");
    }
    const path=join(real,name),st=lstatSync(path);
    if(!st.isFile()||st.isSymbolicLink())throw Error("W26_CLEANUP_REPARSE_FORBIDDEN");
    unlinkSync(path);
  }
  rmdirSync(real);
}
for(const scenario of cases){
  const dir=join(temp,prefix+randomUUID().replaceAll("-",""));
  mkdirSync(dir,{recursive:false});
  let db;
  try {
    const path=join(dir,"orders.sqlite");
    db=createFixture(path,scenario);
    const before=snapshot(db);
    assert.equal(before.orders.length,0);
    const outcome=spawnSync("cargo",[
      "test","--offline","--lib",
      "native_order_outbox::tests::w26_native_catalog_lease_case",
      "--","--ignored"
    ],{
      cwd:nativeDir,windowsHide:true,stdio:"inherit",
      env:{...process.env,FOON_W26_CASE:scenario,FOON_W26_TEST_DB_PATH:path}
    });
    if(outcome.error||outcome.status!==0) {
      throw Error("W26_WINDOWS_NATIVE_LEASE_CASE_FAILED_"+scenario);
    }
    const after=snapshot(db);
    if(scenario==="success"){
      assert.equal(after.orders.length,1);
      assert.equal(after.events.length,1);
      assert.equal(after.outbox.length,1);
      assert.equal(after.outbox[0].event_seq,after.events[0].seq);
      assert.equal(after.outbox[0].synced_at,null);
      assert.equal(after.catalog.find(v=>
        v.tenant_id==="tenant-fixture-w24"&&v.branch_id==="branch-fixture-w24"
      ).stock_qty,8);
      assert.equal(after.catalog.find(v=>v.tenant_id==="other-tenant").stock_qty,10);
      assert.deepEqual(after.leases,before.leases);
    }else{
      assert.deepEqual(after,before,"W26 rejected/expired lease must rollback every table: "+scenario);
    }
    console.log("PASS W26 NATIVE LEASE VALIDATION: "+scenario.toUpperCase());
  }finally{
    if(db)db.close();
    removeOwnTemp(dir);
  }
}
console.log("W26 ALL ELEVEN SYNTHETIC LEASE, EXPIRY, REVISION AND ROLLBACK CASES PASSED");
