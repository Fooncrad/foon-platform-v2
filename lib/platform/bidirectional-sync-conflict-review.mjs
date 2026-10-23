// Read-only conflict review for the local FOON Windows outbox.
// Never resolve, discard, or automatically replay a conflicting business event.
import {validateChangeEnvelope,digestChange} from "./bidirectional-sync-contract.mjs";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function listScopedSyncConflicts(db,{deviceId,tenantId,branchId,limit=50}){
 if(!db||typeof db.execute!=="function"||![deviceId,tenantId,branchId].every(v=>typeof v==="string"&&uuid.test(v))||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error("SYNC_INVALID_CONFLICT_SCOPE");
 const [rows]=await db.execute("SELECT event_id,payload_digest,event_payload,updated_at FROM foon_sync_pending_events WHERE device_id=? AND tenant_id=? AND branch_id=? AND state='conflict' ORDER BY updated_at DESC,event_id ASC LIMIT ?",[deviceId,tenantId,branchId,limit]);
 if(!Array.isArray(rows))throw Error("SYNC_INVALID_CONFLICT_ROWS");
 return rows.map(row=>{
  let change;
  try{change=validateChangeEnvelope(typeof row.event_payload==="string"?JSON.parse(row.event_payload):row.event_payload)}catch{throw Error("SYNC_CONFLICT_EVENT_CORRUPT")}
  if(change.eventId!==row.event_id||change.tenantId!==tenantId||change.branchId!==branchId||digestChange(change)!==row.payload_digest)throw Error("SYNC_CONFLICT_EVENT_CORRUPT");
  // Only metadata is returned: customer/order payload must not leak through review listings.
  return {eventId:change.eventId,entityType:change.entityType,entityId:change.entityId,operation:change.operation,baseVersion:change.baseVersion,updatedAt:row.updated_at,status:"conflict"};
 });
}
