// Durable outbox registration for the isolated bidirectional sync journal.
// Call only within the same owning mysql2 transaction as a committed local
// business change. This does not start a worker or modify legacy POS outbox.
import {validateChangeEnvelope,digestChange} from "./bidirectional-sync-contract.mjs";
const strictUuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function enqueueScopedSyncEvent(db,{change,deviceId}){
 const event=validateChangeEnvelope(change);
 if(!strictUuid.test(deviceId)||!db||typeof db.execute!=="function")throw Error("SYNC_INVALID_OUTBOX_CONTEXT");
 const digest=digestChange(event);
 const [rows]=await db.execute("SELECT tenant_id,branch_id,payload_digest,event_payload,state FROM foon_sync_pending_events WHERE device_id=? AND event_id=? FOR UPDATE",[deviceId,event.eventId]);
 if(rows.length>1)throw Error("SYNC_OUTBOX_DUPLICATE_ROWS");
 if(rows.length===1){
  const old=rows[0];
  if(old.tenant_id!==event.tenantId||old.branch_id!==event.branchId||old.payload_digest!==digest)throw Error("SYNC_OUTBOX_IDEMPOTENCY_CONFLICT");
  // Both payload and digest are immutable for a queued event.\n  let stored;try{stored=typeof old.event_payload==="string"?JSON.parse(old.event_payload):old.event_payload;}catch{throw Error("SYNC_OUTBOX_CORRUPT_EVENT");}\n  if(!stored||digestChange(stored)!==digest)throw Error("SYNC_OUTBOX_CORRUPT_EVENT");\n  return {status:"duplicate",eventId:event.eventId,digest};
 }
 const [result]=await db.execute("INSERT INTO foon_sync_pending_events(device_id,event_id,tenant_id,branch_id,payload_digest,state) VALUES (?,?,?,?,?,'pending')",[deviceId,event.eventId,event.tenantId,event.branchId,digest]);
 if(result?.affectedRows!==1)throw Error("SYNC_OUTBOX_ENQUEUE_FAILED");
 return {status:"queued",eventId:event.eventId,digest};
}
