// W20: creates a new synthetic SQLite outbox under a unique OS-temp folder.
// NEVER accesses or deletes W05/W06, any merchant SQLite, or MariaDB.
import {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import {mkdirSync,realpathSync,existsSync,lstatSync,rmSync} from "node:fs";
import {join,dirname,basename,resolve} from "node:path";
import {tmpdir} from "node:os";
import {eventDigest} from "../../scripts/foon-edge-sync-contract.mjs";

const prefix="FOON-W20-Fixture-";
const events=[
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
const expected=[
  "2bf8b997b4161b8a3535364f3989439a14e0419d7ef90e1ac7ef2c298f7e092c",
  "1bee33364a8b066265ca555ec89f82bb7e46f44a277675037eb20e67d8fe5343",
  "51f3d30997ae2dd4154e14de86755a30e2b52c5dbfd0c0e3f5859a358762c536"
];
function assertVectors(){
  for(let index=0;index<3;index++){
    if(eventDigest(events[index])!==expected[index])
      throw Error("W20_CROSS_LANGUAGE_VECTOR_CHANGED");
  }
}
function verifyPath(path){
  if(typeof path!=="string"||!path.length||basename(path)!=="events.sqlite")
    throw Error("W20_INVALID_FIXTURE_PATH");
  const absolute=resolve(path);
  if(path!==absolute)throw Error("W20_ABSOLUTE_PATH_REQUIRED");
  const name=basename(dirname(path));
  if(!new RegExp("^"+prefix+"[a-f0-9]{32}$","i").test(name))
    throw Error("W20_FIXTURE_DIRECTORY_FORBIDDEN");
  if(!existsSync(path)||!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink())
    throw Error("W20_FIXTURE_NOT_READY");
  const canonical=realpathSync(path);
  const folder=realpathSync(dirname(path));
  const root=realpathSync(tmpdir());
  if(dirname(folder)!==root||dirname(canonical)!==folder)
    throw Error("W20_FIXTURE_NOT_ISOLATED");
  return canonical;
}
function snapshot(dbPath){
  verifyPath(dbPath);
  const database=new DatabaseSync(dbPath,{readOnly:true});
  try{
    const rows=database.prepare(
      "SELECT o.seq AS outbox_seq,o.event_seq,e.order_id,e.kind,e.payload,o.synced_at "+
      "FROM outbox o JOIN events e ON e.seq=o.event_seq ORDER BY o.seq ASC"
    ).all();
    const redacted=rows.map(row=>({
      outboxSeq:Number(row.outbox_seq),eventSeq:Number(row.event_seq),
      synced:row.synced_at!==null,
      digest:eventDigest({
        seq:Number(row.event_seq),order_id:row.order_id,
        kind:row.kind,payload:JSON.parse(row.payload)
      })
    }));
    if(redacted.length!==4||redacted.filter(x=>!x.synced).length!==3||
       redacted.slice(0,3).some((x,i)=>x.digest!==expected[i]))
      throw Error("W20_FIXTURE_CHANGED_OR_INVALID");
    return {total:4,pending:3,redacted};
  }finally{database.close();}
}
function create(){
  assertVectors();
  const parent=join(tmpdir(),prefix+randomUUID().replaceAll("-",""));
  mkdirSync(parent,{recursive:false});
  const dbPath=join(parent,"events.sqlite");
  const db=new DatabaseSync(dbPath);
  try{
    db.exec([
      "PRAGMA foreign_keys=ON;",
      "CREATE TABLE events(",
      "seq INTEGER PRIMARY KEY AUTOINCREMENT,",
      "order_id TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,",
      "created_at TEXT NOT NULL,device_id TEXT);",
      "CREATE TABLE outbox(",
      "seq INTEGER PRIMARY KEY AUTOINCREMENT,",
      "event_seq INTEGER NOT NULL UNIQUE REFERENCES events(seq),",
      "synced_at TEXT,receipt_id TEXT,sync_error TEXT);",
      "BEGIN IMMEDIATE;"
    ].join(" "));
    const addEvent=db.prepare(
      "INSERT INTO events(seq,order_id,kind,payload,created_at) VALUES(?,?,?,?,?)"
    );
    const addOutbox=db.prepare(
      "INSERT INTO outbox(seq,event_seq,synced_at) VALUES(?,?,?)"
    );
    for(const [index,event] of events.entries()){
      addEvent.run(event.seq,event.order_id,event.kind,
        JSON.stringify(event.payload),"2026-10-19T00:00:00.000Z");
      addOutbox.run(index+1,event.seq,index===3?"2026-10-19T00:01:00.000Z":null);
    }
    db.exec("COMMIT;");
  }catch(error){
    try{db.exec("ROLLBACK;");}catch{}
    throw error;
  }finally{db.close();}
  snapshot(dbPath);
  console.log(dbPath);
}
function cleanup(dbPath){
  // Cleanup only a successfully validated synthetic fixture.
  verifyPath(dbPath);
  const result=snapshot(dbPath);
  if(result.total!==4||result.pending!==3)
    throw Error("W20_FIXTURE_DELETE_REFUSED");
  rmSync(dirname(dbPath),{recursive:true,force:false,maxRetries:0});
  console.log("W20_TEMP_SYNTHETIC_FIXTURE_CLEANED");
}
const [action,path]=process.argv.slice(2);
if(action==="--create"&&path===undefined)create();
else if(action==="--inspect"&&typeof path==="string")console.log(JSON.stringify(snapshot(path)));
else if(action==="--cleanup"&&typeof path==="string")cleanup(path);
else throw Error("W20_EXPLICIT_FIXTURE_ACTION_REQUIRED");
