// Validate journal rows before any remote serialization. Never expose raw DB
// values or grant-derived fields without first checking digest and scope.
import {validateChangeEnvelope,digestChange} from "./bidirectional-sync-contract.mjs";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function prepareSyncPullEvents(rows,{tenantId,branchId}){
 if(!uuid.test(tenantId)||!uuid.test(branchId)||!Array.isArray(rows))throw Error("SYNC_INVALID_FEED");
 return rows.map(row=>{
  if(!row||row.tenant_id!==tenantId||row.branch_id!==branchId||!Number.isSafeInteger(Number(row.id))||Number(row.id)<1||!uuid.test(row.source_device_id))throw Error("SYNC_FEED_SCOPE_MISMATCH");
  let payload;
  try {payload=typeof row.payload_json==="string"?JSON.parse(row.payload_json):row.payload_json;}
  catch {throw Error("SYNC_CORRUPT_PAYLOAD");}
  const change=validateChangeEnvelope({
   eventId:row.event_id,tenantId:row.tenant_id,branchId:row.branch_id,
   actorId:row.actor_id,entityId:row.entity_id,entityType:row.entity_type,
   operation:row.operation,baseVersion:Number(row.base_version),
   timestamp:row.event_timestamp,payload
  });
  // The digest binds baseVersion but not the DB-generated next_version.
  if(!Number.isSafeInteger(Number(row.next_version))||Number(row.next_version)!==change.baseVersion+1||digestChange(change)!==row.payload_digest)throw Error("SYNC_CORRUPT_JOURNAL");
  return {
   id:Number(row.id),event_id:change.eventId,tenant_id:change.tenantId,
   branch_id:change.branchId,actor_id:change.actorId,source_device_id:row.source_device_id,
   entity_type:change.entityType,entity_id:change.entityId,operation:change.operation,
   base_version:change.baseVersion,next_version:Number(row.next_version),
   event_timestamp:change.timestamp,payload_json:change.payload,payload_digest:row.payload_digest
  };
 });
}
