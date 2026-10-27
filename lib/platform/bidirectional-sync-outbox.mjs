// Durable outbox registration for the isolated bidirectional sync journal.
// Call only within the same owning mysql2 transaction as a committed local
// business change. This does not start a worker or modify legacy POS outbox.
import {validateChangeEnvelope,digestChange} from "./bidirectional-sync-contract.mjs";
const strictUuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
// RegExp.test coerces arrays and objects to strings; IDs must be literal strings.
const isUuid=value=>typeof value==="string"&&strictUuid.test(value);
export async function enqueueScopedSyncEvent(db,{change,deviceId}){
 const event=validateChangeEnvelope(change);
 if(!isUuid(deviceId)||!db||typeof db.execute!=="function")throw Error("SYNC_INVALID_OUTBOX_CONTEXT");
 const digest=digestChange(event);
 const [rows]=await db.execute("SELECT tenant_id,branch_id,payload_digest,event_payload,state FROM foon_sync_pending_events WHERE device_id=? AND event_id=? FOR UPDATE",[deviceId,event.eventId]);
 if(rows.length>1)throw Error("SYNC_OUTBOX_DUPLICATE_ROWS");
 if(rows.length===1){
  const old=rows[0];
  // MariaDB CHAR UUID scope predicates are case-insensitive; replay checks must match.
  if(!isUuid(old.tenant_id)||!isUuid(old.branch_id)||old.tenant_id.toLowerCase()!==event.tenantId.toLowerCase()||old.branch_id.toLowerCase()!==event.branchId.toLowerCase()||old.payload_digest!==digest)throw Error("SYNC_OUTBOX_IDEMPOTENCY_CONFLICT");
  // Both payload and digest are immutable for a queued event.
  let stored;try{stored=typeof old.event_payload==="string"?JSON.parse(old.event_payload):old.event_payload;}catch{throw Error("SYNC_OUTBOX_CORRUPT_EVENT");}
  if(!stored||digestChange(stored)!==digest)throw Error("SYNC_OUTBOX_CORRUPT_EVENT");
  return {status:"duplicate",eventId:event.eventId,digest};
 }
 const [result]=await db.execute("INSERT INTO foon_sync_pending_events(device_id,event_id,tenant_id,branch_id,payload_digest,event_payload,state) VALUES (?,?,?,?,?,?,'pending')",[deviceId,event.eventId,event.tenantId,event.branchId,digest,JSON.stringify(event)]);
 if(result?.affectedRows!==1)throw Error("SYNC_OUTBOX_ENQUEUE_FAILED");
 return {status:"queued",eventId:event.eventId,digest};
}

export async function readPendingSyncEvents(db,{deviceId,tenantId,branchId,limit=50}){
 if(!isUuid(deviceId)||!isUuid(tenantId)||!isUuid(branchId)||!Number.isSafeInteger(limit)||limit<1||limit>100||typeof db?.execute!=="function")throw Error("SYNC_INVALID_OUTBOX_CONTEXT");
 // An unresolved signed conflict blocks later pending edits in this scope.
 // A subsequent push pass must not bypass a conflicting predecessor.
 const [blocked]=await db.execute("SELECT event_id FROM foon_sync_pending_events WHERE device_id=? AND tenant_id=? AND branch_id=? AND state='conflict' LIMIT 1",[deviceId,tenantId,branchId]);
 if(!Array.isArray(blocked))throw Error("SYNC_OUTBOX_INVALID_ROWS");
 if(blocked.length)throw Error("SYNC_CONFLICT_REVIEW_REQUIRED");
 const [rows]=await db.execute("SELECT event_id,payload_digest,event_payload FROM foon_sync_pending_events WHERE device_id=? AND tenant_id=? AND branch_id=? AND state='pending' ORDER BY queued_at ASC,event_id ASC LIMIT ?",[deviceId,tenantId,branchId,limit]);
 if(!Array.isArray(rows))throw Error("SYNC_OUTBOX_INVALID_ROWS");
 return rows.map(row=>{
  let event;
  try{event=validateChangeEnvelope(typeof row.event_payload==="string"?JSON.parse(row.event_payload):row.event_payload);}catch{throw Error("SYNC_OUTBOX_CORRUPT_EVENT");}
  // Compare canonical UUID identity, not display casing, while still checking the digest.
  if(!isUuid(row.event_id)||event.eventId.toLowerCase()!==row.event_id.toLowerCase()||event.tenantId.toLowerCase()!==tenantId.toLowerCase()||event.branchId.toLowerCase()!==branchId.toLowerCase()||digestChange(event)!==row.payload_digest)throw Error("SYNC_OUTBOX_CORRUPT_EVENT");
  return event;
 });
}
