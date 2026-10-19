// W21: real native read-only WinSQLite3 checks against five temporary,
// synthetic WAL fixtures. Never accepts a DB path from callers, and NEVER
// opens W05/W06, merchant SQLite or any remote MariaDB database.
import {DatabaseSync} from "node:sqlite";
import {spawnSync} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import {
  mkdirSync,readFileSync,existsSync,realpathSync,statSync,lstatSync,
  readdirSync,unlinkSync,rmdirSync
} from "node:fs";
import {tmpdir} from "node:os";
import {join,dirname,basename} from "node:path";
import {fileURLToPath} from "node:url";
import {eventDigest} from "../../scripts/foon-edge-sync-contract.mjs";

if(process.argv.length!==3||process.argv[2]!=="--run")
  throw Error("W21_EXPLICIT_SYNTHETIC_TEST_RUN_REQUIRED");

const desktop=fileURLToPath(new URL(".",import.meta.url));
const rustDirectory=join(desktop,"src-tauri");
const root=realpathSync(tmpdir());
const prefix="FOON-W20-Fixture-";
const testCases=["wal","corrupt","orphan","duplicate","limit"];

const baseEvents=[
  {seq:11,order_id:"order-fixture-19",kind:"created",payload:{
    id:"order-fixture-19",branchId:"branch-fixture-19",
    items:[{id:"item-A",quantity:2,expectedUnitCents:950,expectedCurrency:"SAR"}]
  }},
  {seq:12,order_id:"order-fixture-19",kind:"status",payload:{
    id:"order-fixture-19",status:"preparing",updatedAt:"2026-10-19T00:00:00.000Z"
  }},
  {seq:13,order_id:"order-fixture-19",kind:"status",payload:{
    note:"قهوة عربية",status:"ready"
  }},
  {seq:14,order_id:"order-fixture-19",kind:"status",payload:{
    id:"order-fixture-19",status:"completed"
  }}
];
const checksums=[
  "2bf8b997b4161b8a3535364f3989439a14e0419d7ef90e1ac7ef2c298f7e092c",
  "1bee33364a8b066265ca555ec89f82bb7e46f44a277675037eb20e67d8fe5343",
  "51f3d30997ae2dd4154e14de86755a30e2b52c5dbfd0c0e3f5859a358762c536"
];
for(let i=0;i<checksums.length;i++){
  if(eventDigest(baseEvents[i])!==checksums[i])throw Error("W21_JS_EVENT_DIGEST_BASELINE_CHANGED");
}
function hashFile(path){
  return existsSync(path)?createHash("sha256").update(readFileSync(path)).digest("hex"):null;
}
function safeCleanup(folder){
  // Only delete the specific directory created by this invocation.
  const resolved=realpathSync(folder);
  const name=basename(resolved);
  if(dirname(resolved)!==root||
     !/^FOON-W20-Fixture-[0-9a-f]{32}$/.test(name)||
     lstatSync(resolved).isSymbolicLink())
    throw Error("W21_CLEANUP_PATH_REFUSED");
  const names=readdirSync(resolved);
  const allowed=new Set(["events.sqlite","events.sqlite-wal","events.sqlite-shm"]);
  for(const name of names){
    if(!allowed.has(name)||!lstatSync(join(resolved,name)).isFile()||
       lstatSync(join(resolved,name)).isSymbolicLink())
      throw Error("W21_CLEANUP_UNKNOWN_ENTRY");
  }
  for(const name of names)unlinkSync(join(resolved,name));
  rmdirSync(resolved);
}
function populate(db,scenario){
  const mode=db.prepare("PRAGMA journal_mode=WAL").get().journal_mode;
  if(mode!=="wal")throw Error("W21_SQLITE_WAL_MODE_NOT_AVAILABLE");
  db.exec("PRAGMA wal_autocheckpoint=0; PRAGMA foreign_keys=OFF;");
  // Duplicate references and orphans are deliberate adversarial inputs.
  db.exec([
    "CREATE TABLE events(seq INTEGER PRIMARY KEY,order_id TEXT NOT NULL,",
    "kind TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);",
    "CREATE TABLE outbox(seq INTEGER PRIMARY KEY,event_seq INTEGER NOT NULL,",
    "synced_at TEXT,receipt_id TEXT);",
    "BEGIN IMMEDIATE;"
  ].join(" "));
  const insertEvent=db.prepare(
    "INSERT INTO events(seq,order_id,kind,payload,created_at) VALUES(?,?,?,?,?)"
  );
  const insertOutbox=db.prepare(
    "INSERT INTO outbox(seq,event_seq,synced_at) VALUES(?,?,?)"
  );
  try{
    for(let i=0;i<baseEvents.length;i++){
      const e=baseEvents[i];
      insertEvent.run(e.seq,e.order_id,e.kind,JSON.stringify(e.payload),"2026-10-19T00:00:00.000Z");
      insertOutbox.run(i+1,e.seq,i===3?"2026-10-19T00:01:00.000Z":null);
    }
    if(scenario==="wal"){
      const event={seq:15,order_id:"order-fixture-19",kind:"status",
        payload:{id:"order-fixture-19",status:"completed",note:"فحص WAL"}};
      insertEvent.run(event.seq,event.order_id,event.kind,
        JSON.stringify(event.payload),"2026-10-19T00:02:00.000Z");
      insertOutbox.run(5,15,null);
      db.exec("COMMIT;");
      return eventDigest(event);
    }
    if(scenario==="corrupt"){
      db.prepare("UPDATE events SET payload=? WHERE seq=12").run('{"incomplete":');
    }else if(scenario==="orphan"){
      insertOutbox.run(5,99,null);
    }else if(scenario==="duplicate"){
      insertOutbox.run(5,11,null);
    }else if(scenario==="limit"){
      for(let i=0;i<30;i++){
        const seq=100+i;
        insertEvent.run(seq,"order-fixture-19","status",
          JSON.stringify({id:"order-fixture-19",status:"ready",index:i}),
          "2026-10-19T00:03:00.000Z");
        insertOutbox.run(5+i,seq,null);
      }
    }else throw Error("W21_UNKNOWN_CASE");
    db.exec("COMMIT;");
    return "";
  }catch(error){
    try{db.exec("ROLLBACK;");}catch{}
    throw error;
  }
}

for(const scenario of testCases){
  const folder=join(root,prefix+randomUUID().replaceAll("-",""));
  mkdirSync(folder,{recursive:false});
  let db;
  try{
    const dbPath=join(folder,"events.sqlite");
    db=new DatabaseSync(dbPath);
    const expectedDigest=populate(db,scenario);
    const pending=Number(db.prepare(
      "SELECT COUNT(*) AS total FROM outbox WHERE synced_at IS NULL"
    ).get().total);
    if(pending!==(scenario==="wal"?4:scenario==="limit"?33:scenario==="duplicate"||scenario==="orphan"?4:3))
      throw Error("W21_UNEXPECTED_SYNTHETIC_PENDING_COUNT");

    // Keep the WAL writer connection OPEN for the entire native Rust read.
    // Closing the last SQLite connection may checkpoint/delete the WAL.
    const dbHashBefore=hashFile(dbPath);
    const walPath=dbPath+"-wal";
    const walHashBefore=hashFile(walPath);
    if(!walHashBefore)throw Error("W21_SYNTHETIC_WAL_NOT_PERSISTED");

    const env={...process.env,FOON_W21_CASE:scenario,FOON_W21_TEST_DB_PATH:dbPath,
      FOON_W21_EXPECTED_DIGEST:expectedDigest};
    const child=spawnSync("cargo",[
      "test","--offline","--lib","w21_fixture_boundary","--","--ignored"
    ],{cwd:rustDirectory,env,stdio:"inherit",windowsHide:true});
    if(child.error||child.status!==0)
      throw Error("W21_NATIVE_ADVERSARIAL_TEST_FAILED_"+scenario.toUpperCase());

    if(dbHashBefore!==hashFile(dbPath)||walHashBefore!==hashFile(walPath))
      throw Error("W21_NATIVE_READ_MODIFIED_DB_OR_WAL");
    console.log("PASS W21 NATIVE WAL READ-ONLY CASE: "+scenario.toUpperCase());
  }finally{
    if(db)db.close();
    safeCleanup(folder);
  }
}
console.log("W21 ALL 5 SYNTHETIC WAL/CORRUPTION/INTEGRITY CASES PASSED");
