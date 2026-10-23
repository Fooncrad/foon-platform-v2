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
  // Inventory movements use a unique event ID as their versioned entity; a
  // legitimate movement therefore begins at zero and can only advance to one.
  if(e.entity_type==="inventory_movement"){
   if(e.entity_id!==e.event_id||e.base_version!==0||e.next_version!==1)throw Error("SYNC_CORRUPT_REMOTE_VERSION");
  }else if(e.next_version!==e.base_version+1)throw Error("SYNC_CORRUPT_REMOTE_VERSION");
  if(digestChange(change)!==e.payload_digest||!Number.isSafeInteger(e.next_version)||e.next_version<1||!uuid.test(e.source_device_id))throw Error("SYNC_CORRUPT_REMOTE_EVENT");
 }
 await db.beginTransaction();
 let committed=false;
 try{
  const [rows]=await db.execute("SELECT last_pulled_id FROM foon_sync_device_cursors WHERE device_id=? AND tenant_id=? AND branch_id=? FOR UPDATE",[scope.deviceId,scope.tenantId,scope.branchId]);
  if(rows.length!==1)throw Error("SYNC_CURSOR_NOT_PROVISIONED");
  const actual=Number(rows[0].last_pulled_id);
  if(!Number.isSafeInteger(actual)||actual!==scope.after)throw Error("SYNC_CURSOR_CONFLICT");
  let appliedCount=0;
  for(const event of events){
   // This device already committed its own business mutation before enqueueing
   // the outbound event. A signed cloud echo must advance the pull cursor but
   // must never execute that mutation twice (especially inventory movements).
   if(event.source_device_id===scope.deviceId){
    // A signed source_device_id is not proof that this installation still has
    // the corresponding local write (e.g. after restoring an older backup).
    // Never silently skip an echo and advance the cursor without durable proof.
    const [owned]=await db.execute("SELECT tenant_id,branch_id,payload_digest,event_payload FROM foon_sync_pending_events WHERE device_id=? AND event_id=? FOR UPDATE",[scope.deviceId,event.event_id]);
    if(!Array.isArray(owned)||owned.length!==1||owned[0].tenant_id!==scope.tenantId||owned[0].branch_id!==scope.branchId||owned[0].payload_digest!==event.payload_digest)throw Error("SYNC_LOCAL_ECHO_UNPROVEN");
    let local;
    try{
     local=validateChangeEnvelope(typeof owned[0].event_payload==="string"?JSON.parse(owned[0].event_payload):owned[0].event_payload);
    }catch{throw Error("SYNC_LOCAL_ECHO_UNPROVEN");}
    if(local.eventId!==event.event_id||digestChange(local)!==event.payload_digest)throw Error("SYNC_LOCAL_ECHO_UNPROVEN");
    continue;
   }
   if(await applyEvent(db,event)!==true)throw Error("SYNC_LOCAL_APPLY_UNCONFIRMED");
   appliedCount++;
  }
  if(candidateCursor!==actual){
   const [updated]=await db.execute("UPDATE foon_sync_device_cursors SET last_pulled_id=? WHERE device_id=? AND tenant_id=? AND branch_id=? AND last_pulled_id=?",[candidateCursor,scope.deviceId,scope.tenantId,scope.branchId,actual]);
   if(updated?.affectedRows!==1)throw Error("SYNC_CURSOR_WRITE_CONFLICT");
  }
  await db.commit();
  committed=true;
  return {status:"applied",nextCursor:candidateCursor,count:appliedCount};
 }finally{
  if(!committed)await db.rollback();
 }
}
