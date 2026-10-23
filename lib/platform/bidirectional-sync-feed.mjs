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
  const nextVersion=Number(row.next_version);
  // A signed feed must never carry an impossible journal version. Detect
  // corruption at the cloud boundary, before signing and advancing cursors.
  if(!Number.isSafeInteger(nextVersion)||nextVersion<1||nextVersion!==change.baseVersion+1)throw Error("SYNC_CORRUPT_JOURNAL_VERSION");
  // Stock movements are immutable one-off events, never updates to an
  // existing item version. The Windows receiver enforces the same invariant.
  if(change.entityType==="inventory_movement"&&(change.entityId!==change.eventId||change.baseVersion!==0||nextVersion!==1))throw Error("SYNC_CORRUPT_JOURNAL_VERSION");
  if(digestChange(change)!==row.payload_digest)throw Error("SYNC_CORRUPT_JOURNAL");
  return {
   id:Number(row.id),event_id:change.eventId,tenant_id:change.tenantId,
   branch_id:change.branchId,actor_id:change.actorId,source_device_id:row.source_device_id,
   entity_type:change.entityType,entity_id:change.entityId,operation:change.operation,
   base_version:change.baseVersion,next_version:nextVersion,
   event_timestamp:change.timestamp,payload_json:change.payload,payload_digest:row.payload_digest
  };
 });
}
