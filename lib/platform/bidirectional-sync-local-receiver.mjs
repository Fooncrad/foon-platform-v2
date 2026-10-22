// Offline receiver foundation. Caller must verify the remote server's signed
// batch BEFORE invoking this function. This does not enable live synchronization.
import {validatePullBatch} from "./bidirectional-sync-wire-contract.mjs";
import {verifySignedPullBatch} from "./bidirectional-sync-signature.mjs";
import {validateChangeEnvelope,digestChange} from "./bidirectional-sync-contract.mjs";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function applyVerifiedPullBatch({db,batch,scope,signature,publicKey,applyEvent}){
 verifySignedPullBatch({batch,scope,signature,publicKey});
 if(typeof applyEvent!=="function")throw Error("SYNC_LOCAL_ADAPTER_REQUIRED");
 if(!db||typeof db.beginTransaction!=="function"||typeof db.commit!=="function"||typeof db.rollback!=="function"||typeof db.execute!=="function")throw Error("SYNC_TRANSACTION_REQUIRED");
 if(!uuid.test(scope?.deviceId))throw Error("SYNC_INVALID_DEVICE");
 const {events,candidateCursor}=validatePullBatch(batch,scope);
 // Signature authenticity alone does not guarantee journal envelope integrity.
 // Refuse malformed or digest-mismatched rows before starting any transaction.
 for(const e of events){
  const change=validateChangeEnvelope({eventId:e.event_id,tenantId:e.tenant_id,branchId:e.branch_id,actorId:e.actor_id,entityType:e.entity_type,entityId:e.entity_id,operation:e.operation,baseVersion:e.base_version,timestamp:e.event_timestamp,payload:e.payload_json});
  if(digestChange(change)!==e.payload_digest||!Number.isSafeInteger(e.next_version)||e.next_version<1||!uuid.test(e.source_device_id))throw Error("SYNC_CORRUPT_REMOTE_EVENT");
 }
 await db.beginTransaction();
 let committed=false;
 try{
  const [rows]=await db.execute("SELECT last_pulled_id FROM foon_sync_device_cursors WHERE device_id=? AND tenant_id=? AND branch_id=? FOR UPDATE",[scope.deviceId,scope.tenantId,scope.branchId]);
  if(rows.length!==1)throw Error("SYNC_CURSOR_NOT_PROVISIONED");
  const actual=Number(rows[0].last_pulled_id);
  if(!Number.isSafeInteger(actual)||actual!==scope.after)throw Error("SYNC_CURSOR_CONFLICT");
  for(const event of events){
   if(await applyEvent(db,event)!==true)throw Error("SYNC_LOCAL_APPLY_UNCONFIRMED");
  }
  if(candidateCursor!==actual){
   const [updated]=await db.execute("UPDATE foon_sync_device_cursors SET last_pulled_id=? WHERE device_id=? AND tenant_id=? AND branch_id=? AND last_pulled_id=?",[candidateCursor,scope.deviceId,scope.tenantId,scope.branchId,actual]);
   if(updated?.affectedRows!==1)throw Error("SYNC_CURSOR_WRITE_CONFLICT");
  }
  await db.commit();
  committed=true;
  return {status:"applied",nextCursor:candidateCursor,count:events.length};
 }finally{
  if(!committed)await db.rollback();
 }
}
