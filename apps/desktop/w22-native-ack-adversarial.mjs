// W22 ONLY. Eight synthetic, isolated, disposable WinSQLite3 ACK cases.
// This test harness cannot accept an external database path; it chooses a
// random W22-prefixed OS temporary directory per test scenario.
import {DatabaseSync} from "node:sqlite";
import {spawnSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {existsSync,realpathSync,mkdirSync,readdirSync,lstatSync,unlinkSync,rmdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,basename,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
import {eventDigest} from "../../scripts/foon-edge-sync-contract.mjs";
import {signCloudReceipt} from "../../lib/platform/edge-sync-receipt-signature.mjs";

if(process.argv.length!==3||process.argv[2]!=="--run")
  throw Error("W22_EXPLICIT_SANDBOX_TEST_REQUIRED");
if(process.env.FOON_W22_TEST_DB_PATH||process.env.FOON_W22_SYNTHETIC_RECEIPT)
  throw Error("W22_PREEXISTING_TEST_OVERRIDES_FORBIDDEN");

const root=realpathSync(tmpdir());
const prefix="FOON-W22-Fixture-";
const desktop=fileURLToPath(new URL(".",import.meta.url));
const rustDirectory=join(desktop,"src-tauri");
const testKey="foon-w17-only-synthetic-device-key-123456789012345";
const created={seq:11,order_id:"order-fixture-19",kind:"created",payload:{
  id:"order-fixture-19",branchId:"branch-fixture-19",
  items:[{id:"item-A",quantity:2,expectedUnitCents:950,expectedCurrency:"SAR"}]
}};
const status={seq:12,order_id:"order-fixture-19",kind:"status",payload:{
  id:"order-fixture-19",status:"preparing",updatedAt:"2026-10-19T00:00:00.000Z"
}};
const createdDigest="2bf8b997b4161b8a3535364f3989439a14e0419d7ef90e1ac7ef2c298f7e092c";
assert.equal(eventDigest(created),createdDigest);
const receipt=signCloudReceipt({
  receiptId:"receipt-w22-001",deviceId:"device-fixture-w22",
  eventSeq:11,orderId:"order-fixture-19",digest:createdDigest
},testKey);
const cases=[
  "success","rollback","wrong-tenant","wrong-branch","wrong-device",
  "wrong-seq","bad-signature","changed-payload","orphan"
];
function cleanupOnlyOwnFixture(directory){
  const full=realpathSync(directory);
  if(dirname(full)!==root || !/^FOON-W22-Fixture-[a-f0-9]{32}$/.test(basename(full)))
    throw Error("W22_UNSAFE_CLEANUP_PATH");
  for(const name of readdirSync(full)){
    if(!["ack-fixture.sqlite","ack-fixture.sqlite-wal","ack-fixture.sqlite-shm"].includes(name))
      throw Error("W22_UNKNOWN_TEMP_FILE_REFUSE_CLEANUP");
    const file=join(full,name),info=lstatSync(file);
    if(!info.isFile()||info.isSymbolicLink())
      throw Error("W22_UNEXPECTED_TEMP_FILE_KIND");
    unlinkSync(file);
  }
  rmdirSync(full);
}
function newFixture(path,scenario){
  const db=new DatabaseSync(path);
  const mode=db.prepare("PRAGMA journal_mode=WAL").get().journal_mode;
  if(mode!=="wal")throw Error("W22_SQLITE_WAL_REQUIRED");
  db.exec([
    "PRAGMA foreign_keys=OFF;",
    "CREATE TABLE events(",
    "seq INTEGER PRIMARY KEY,order_id TEXT NOT NULL,kind TEXT NOT NULL,",
    "payload TEXT NOT NULL,tenant_id TEXT NOT NULL,branch_id TEXT NOT NULL,device_id TEXT NOT NULL);",
    "CREATE TABLE outbox(",
    "seq INTEGER PRIMARY KEY,event_seq INTEGER NOT NULL,",
    "synced_at TEXT,receipt_id TEXT);",
    "BEGIN IMMEDIATE;"
  ].join(" "));
  const e=db.prepare(
    "INSERT INTO events(seq,order_id,kind,payload,tenant_id,branch_id,device_id) VALUES(?,?,?,?,?,?,?)"
  );
  const o=db.prepare("INSERT INTO outbox(seq,event_seq,synced_at,receipt_id) VALUES(?,?,?,?)");
  try{
    for(const event of [created,status]){
      e.run(event.seq,event.order_id,event.kind,JSON.stringify(event.payload),
        "tenant-fixture-w22","branch-fixture-w22","device-fixture-w22");
    }
    e.run(13,"order-fixture-19","status",
      JSON.stringify({id:"order-fixture-19",status:"completed"}),
      "tenant-fixture-w22","branch-fixture-w22","device-fixture-w22");
    o.run(1,11,null,null);
    o.run(2,12,null,null);
    o.run(3,13,"W22-PREVIOUSLY-ACKED","older-receipt");
    if(scenario==="changed-payload"){
      db.prepare("UPDATE events SET payload=? WHERE seq=11")
        .run(JSON.stringify({...created.payload,note:"changed without new signature"}));
    }
    if(scenario==="orphan")db.prepare("DELETE FROM events WHERE seq=11").run();
    db.exec("COMMIT;");
  }catch(err){
    try{db.exec("ROLLBACK;");}catch{}
    db.close();
    throw err;
  }
  return db;
}
function snapshot(db){
  return db.prepare(
    "SELECT seq,event_seq,synced_at,receipt_id FROM outbox ORDER BY seq"
  ).all().map(v=>({
    seq:Number(v.seq),eventSeq:Number(v.event_seq),
    syncedAt:v.synced_at,receiptId:v.receipt_id
  }));
}
for(const scenario of cases){
  const dir=join(root,prefix+randomUUID().replaceAll("-",""));
  mkdirSync(dir,{recursive:false});
  let db;
  try{
    const file=join(dir,"ack-fixture.sqlite");
    db=newFixture(file,scenario);
    const before=snapshot(db);
    const input=scenario==="bad-signature"?
      {...receipt,signature:"f".repeat(64)}:receipt;
    const env={...process.env,
      FOON_W22_CASE:scenario,
      FOON_W22_TEST_DB_PATH:file,
      FOON_W22_SYNTHETIC_RECEIPT:JSON.stringify(input)
    };
    const result=spawnSync("cargo",[
      "test","--offline","--lib","native_ack_sandbox::tests::synthetic_signed_ack_transaction",
      "--","--ignored"
    ],{cwd:rustDirectory,env,stdio:"inherit",windowsHide:true});
    if(result.error||result.status!==0)
      throw Error("W22_NATIVE_SYNTHETIC_TEST_FAILED_"+scenario.toUpperCase());
    const after=snapshot(db);
    assert.equal(after.length,3,"must keep 3 local synthetic events");
    assert.deepEqual(after.slice(1),before.slice(1),"unrelated events and earlier ACK untouched");
    if(scenario==="success"){
      assert.equal(after[0].syncedAt,"W22-SYNTHETIC-ACK");
      assert.equal(after[0].receiptId,receipt.receiptId);
    }else{
      assert.deepEqual(after,before,"any rejection/rollback must not ACK");
    }
    console.log("PASS W22 SYNTHETIC SIGNED SQLITE TRANSACTION: "+scenario.toUpperCase());
  }finally{
    if(db)db.close();
    cleanupOnlyOwnFixture(dir);
  }
}
console.log("W22 ALL 9 NATIVE SIGNED-ACK TRANSACTION CASES PASSED (TEST-ONLY)");
