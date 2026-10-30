import {DatabaseSync} from "node:sqlite";
import {mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {createHash,randomUUID} from "node:crypto";

const ACTIVITIES=new Set(["restaurant","cafe","grocery","fashion","perfume_beauty","accessories_watches","gifts_packaging","ecommerce","car_wash","laundry","vehicle_services","salon_beauty","contracting","general_services"]);
const ENTITY=/^[a-z][a-z0-9_.-]{1,63}$/;
const ID=/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
const iso=()=>new Date().toISOString();
const json=value=>JSON.stringify(value);
const digest=value=>createHash("sha256").update(json(value)).digest("hex");

/**
 * Activity-neutral transactional offline journal.
 * UI/API adapters must supply authenticated tenant, branch and device scope;
 * this module never accepts scope from an untrusted payload.
 */
export function openActivityStore(file){
 const path=resolve(file);mkdirSync(dirname(path),{recursive:true});
 const db=new DatabaseSync(path);
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS activity_records(
  tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL, activity TEXT NOT NULL,
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, version INTEGER NOT NULL,
  payload TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL, PRIMARY KEY(tenant_id,branch_id,activity,entity_type,entity_id)
 );
 CREATE TABLE IF NOT EXISTS activity_events(
  seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE, tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL,
  activity TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  base_version INTEGER NOT NULL, next_version INTEGER NOT NULL,
  operation TEXT NOT NULL, payload TEXT NOT NULL, payload_digest TEXT NOT NULL,
  device_id TEXT NOT NULL, created_at TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS activity_outbox(
  event_seq INTEGER PRIMARY KEY REFERENCES activity_events(seq),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','retry','conflict','synced')),
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, receipt_id TEXT, synced_at TEXT
 );
 CREATE INDEX IF NOT EXISTS activity_outbox_pending ON activity_outbox(state,event_seq);
 CREATE INDEX IF NOT EXISTS activity_records_scope ON activity_records(tenant_id,branch_id,activity,entity_type);
 `);
 const get=db.prepare("SELECT * FROM activity_records WHERE tenant_id=? AND branch_id=? AND activity=? AND entity_type=? AND entity_id=?");
 const prior=db.prepare("SELECT * FROM activity_events WHERE idempotency_key=?");
 function transaction(fn){db.exec("BEGIN IMMEDIATE");try{const v=fn();db.exec("COMMIT");return v;}catch(e){db.exec("ROLLBACK");throw e;}}
 function validateScope(scope){
  if(!scope||typeof scope.tenantId!=="string"||!ID.test(scope.tenantId)||typeof scope.branchId!=="string"||!ID.test(scope.branchId)||typeof scope.deviceId!=="string"||!ID.test(scope.deviceId))throw Error("INVALID_AUTHENTICATED_SCOPE");
 }
 function append(scope,input){
  validateScope(scope);
  if(!input||!ACTIVITIES.has(input.activity)||typeof input.entityType!=="string"||!ENTITY.test(input.entityType)||typeof input.entityId!=="string"||!ID.test(input.entityId)||!["upsert","delete"].includes(input.operation)||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0||!input.payload||typeof input.payload!=="object"||Array.isArray(input.payload)||typeof input.idempotencyKey!=="string"||!ID.test(input.idempotencyKey))throw Error("INVALID_ACTIVITY_EVENT");
  const encoded=json(input.payload),payloadDigest=digest({activity:input.activity,entityType:input.entityType,entityId:input.entityId,operation:input.operation,payload:input.payload,expectedVersion:input.expectedVersion});
  return transaction(()=>{
   const existing=prior.get(input.idempotencyKey);
   if(existing){
    if(existing.payload_digest!==payloadDigest||existing.tenant_id!==scope.tenantId||existing.branch_id!==scope.branchId||existing.device_id!==scope.deviceId)throw Error("IDEMPOTENCY_KEY_REUSED");
    return {duplicate:true,seq:existing.seq,eventId:existing.event_id,version:existing.next_version};
   }
   const row=get.get(scope.tenantId,scope.branchId,input.activity,input.entityType,input.entityId);
   const current=row?.version||0;
   if(current!==input.expectedVersion)throw Error("ACTIVITY_VERSION_CONFLICT");
   const next=current+1,now=iso(),eventId=randomUUID();
   db.prepare(`INSERT INTO activity_records(tenant_id,branch_id,activity,entity_type,entity_id,version,payload,deleted,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,branch_id,activity,entity_type,entity_id)
    DO UPDATE SET version=excluded.version,payload=excluded.payload,deleted=excluded.deleted,updated_at=excluded.updated_at`)
    .run(scope.tenantId,scope.branchId,input.activity,input.entityType,input.entityId,next,encoded,input.operation==="delete"?1:0,now);
   const result=db.prepare(`INSERT INTO activity_events(event_id,idempotency_key,tenant_id,branch_id,activity,entity_type,entity_id,base_version,next_version,operation,payload,payload_digest,device_id,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(eventId,input.idempotencyKey,scope.tenantId,scope.branchId,input.activity,input.entityType,input.entityId,current,next,input.operation,encoded,payloadDigest,scope.deviceId,now);
   const seq=Number(result.lastInsertRowid);db.prepare("INSERT INTO activity_outbox(event_seq) VALUES(?)").run(seq);
   return {duplicate:false,seq,eventId,version:next};
  });
 }
 function read(scope,filter={}){
  validateScope(scope);
  const clauses=["tenant_id=?","branch_id=?"],args=[scope.tenantId,scope.branchId];
  if(filter.activity){if(!ACTIVITIES.has(filter.activity))throw Error("INVALID_ACTIVITY");clauses.push("activity=?");args.push(filter.activity);}
  if(filter.entityType){if(!ENTITY.test(filter.entityType))throw Error("INVALID_ENTITY_TYPE");clauses.push("entity_type=?");args.push(filter.entityType);}
  return db.prepare("SELECT activity,entity_type AS entityType,entity_id AS entityId,version,payload,deleted,updated_at AS updatedAt FROM activity_records WHERE "+clauses.join(" AND ")+" ORDER BY activity,entity_type,entity_id").all(...args).map(r=>({...r,payload:JSON.parse(r.payload),deleted:Boolean(r.deleted)}));
 }
 function pending(scope,limit=100){
  validateScope(scope);if(!Number.isInteger(limit)||limit<1||limit>500)throw Error("INVALID_LIMIT");
  return db.prepare(`SELECT e.seq,e.event_id AS eventId,e.idempotency_key AS idempotencyKey,e.activity,e.entity_type AS entityType,e.entity_id AS entityId,e.base_version AS baseVersion,e.next_version AS nextVersion,e.operation,e.payload,e.payload_digest AS digest,e.device_id AS deviceId,e.created_at AS createdAt,o.state,o.attempts
   FROM activity_events e JOIN activity_outbox o ON o.event_seq=e.seq
   WHERE e.tenant_id=? AND e.branch_id=? AND o.state IN ('pending','retry') ORDER BY e.seq LIMIT ?`).all(scope.tenantId,scope.branchId,limit).map(r=>({...r,payload:JSON.parse(r.payload)}));
 }
 function markRetry(seq,error){
  if(!Number.isSafeInteger(seq)||seq<1)throw Error("INVALID_EVENT_SEQUENCE");
  db.prepare("UPDATE activity_outbox SET state='retry',attempts=attempts+1,last_error=? WHERE event_seq=? AND state<>'synced'").run(String(error||"SYNC_FAILED").slice(0,160),seq);
 }
 function markConflict(seq,reason){
  if(!Number.isSafeInteger(seq)||seq<1)throw Error("INVALID_EVENT_SEQUENCE");
  db.prepare("UPDATE activity_outbox SET state='conflict',attempts=attempts+1,last_error=? WHERE event_seq=? AND state<>'synced'").run(String(reason||"VERSION_CONFLICT").slice(0,160),seq);
 }
 function acknowledge(seq,receipt){
  if(!Number.isSafeInteger(seq)||seq<1||!receipt||typeof receipt.receiptId!=="string"||receipt.receiptId.length<8)throw Error("INVALID_CLOUD_RECEIPT");
  const result=db.prepare("UPDATE activity_outbox SET state='synced',receipt_id=?,synced_at=?,last_error=NULL WHERE event_seq=? AND state<>'synced'").run(receipt.receiptId,iso(),seq);
  if(!result.changes&&!db.prepare("SELECT 1 FROM activity_outbox WHERE event_seq=? AND state='synced' AND receipt_id=?").get(seq,receipt.receiptId))throw Error("UNKNOWN_ACTIVITY_EVENT");
  return {synced:true,duplicate:result.changes===0};
 }
 function close(){db.close();}
 return {append,read,pending,markRetry,markConflict,acknowledge,close};
}
