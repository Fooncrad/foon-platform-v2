// Database adapter to be called INSIDE an authenticated business transaction.
// This module performs no network calls. Caller must authenticate device and authorize tenant/branch/actor.
import {validateChangeEnvelope,digestChange,resolveChange,validatePullCursor} from "./bidirectional-sync-contract.mjs";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sameUuid=(left,right)=>typeof left==="string"&&typeof right==="string"&&uuid.test(left)&&uuid.test(right)&&left.toLowerCase()===right.toLowerCase();
export async function appendScopedChange(db,{change,sourceDeviceId}){
 const e=validateChangeEnvelope(change);
 if(typeof sourceDeviceId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(sourceDeviceId))throw Error("SYNC_INVALID_DEVICE");
 // The caller must keep this same DB connection and transaction until commit.
 // All writers in the scope acquire the mutex BEFORE allocating an auto-increment journal ID.
 await db.execute("INSERT INTO foon_sync_scope_locks(tenant_id,branch_id) VALUES (?,?) ON DUPLICATE KEY UPDATE tenant_id=VALUES(tenant_id)",[e.tenantId,e.branchId]);
 const [existing]=await db.execute("SELECT payload_digest,tenant_id,branch_id,source_device_id,next_version FROM foon_sync_changes WHERE event_id=? LIMIT 1 FOR UPDATE",[e.eventId]);
 const digest=digestChange(e);
 if(existing.length){
   if(existing[0].payload_digest!==digest||!sameUuid(existing[0].tenant_id,e.tenantId)||!sameUuid(existing[0].branch_id,e.branchId)||!sameUuid(existing[0].source_device_id,sourceDeviceId))throw Error("SYNC_IDEMPOTENCY_CONFLICT");
   const nextVersion=Number(existing[0].next_version);
   if(!Number.isSafeInteger(nextVersion)||nextVersion<1)throw Error("SYNC_INVALID_STORED_VERSION");
   return {status:"duplicate",eventId:e.eventId,nextVersion};
 }
 const key=[e.tenantId,e.branchId,e.entityType,e.entityId];
 const [rows]=await db.execute("SELECT version,last_event_id FROM foon_sync_versions WHERE tenant_id=? AND branch_id=? AND entity_type=? AND entity_id=? FOR UPDATE",key);
 const v=rows[0]?Number(rows[0].version):0;
 if(!Number.isSafeInteger(v)||v<0||v>=Number.MAX_SAFE_INTEGER)throw Error("SYNC_INVALID_STORED_VERSION");
 const decision=resolveChange({incoming:e,current:rows[0]?{tenantId:e.tenantId,branchId:e.branchId,entityType:e.entityType,entityId:e.entityId,version:v}:null});
 if(decision.status!=="apply")return decision;
 if(rows.length){
   const [updated]=await db.execute("UPDATE foon_sync_versions SET version=?,last_event_id=? WHERE tenant_id=? AND branch_id=? AND entity_type=? AND entity_id=? AND version=?",[decision.nextVersion,e.eventId,...key,v]);
   if(!updated||updated.affectedRows!==1)throw Error("SYNC_VERSION_UPDATE_FAILED");
 }else{
   // Concurrent creation must fail closed by PK uniqueness; owning transaction rolls back.
   const [created]=await db.execute("INSERT INTO foon_sync_versions(tenant_id,branch_id,entity_type,entity_id,version,last_event_id) VALUES (?,?,?,?,?,?)",[...key,decision.nextVersion,e.eventId]);
   if(!created||created.affectedRows!==1)throw Error("SYNC_VERSION_INSERT_FAILED");
 }
 const [written]=await db.execute("INSERT INTO foon_sync_changes(event_id,tenant_id,branch_id,actor_id,source_device_id,entity_type,entity_id,operation,base_version,next_version,event_timestamp,payload_json,payload_digest) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",[e.eventId,e.tenantId,e.branchId,e.actorId,sourceDeviceId,e.entityType,e.entityId,e.operation,e.baseVersion,decision.nextVersion,e.timestamp,JSON.stringify(e.payload),digest]);
 if(!written||written.affectedRows!==1)throw Error("SYNC_JOURNAL_INSERT_FAILED");
 return {status:"recorded",eventId:e.eventId,nextVersion:decision.nextVersion};
}
export async function pullScopedChanges(db,{tenantId,branchId,after=0,limit=100}){
 validatePullCursor(after);
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(tenantId)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(branchId))throw Error("SYNC_INVALID_SCOPE");
 if(!Number.isSafeInteger(limit)||limit<1||limit>200)throw Error("SYNC_INVALID_LIMIT");
 const [rows]=await db.execute("SELECT id,event_id,tenant_id,branch_id,actor_id,source_device_id,entity_type,entity_id,operation,base_version,next_version,event_timestamp,payload_json,payload_digest,created_at FROM foon_sync_changes WHERE tenant_id=? AND branch_id=? AND id>? ORDER BY id ASC LIMIT ?",[tenantId,branchId,after,limit]);
 return {events:rows,nextCursor:rows.length?Number(rows[rows.length-1].id):after};
}
