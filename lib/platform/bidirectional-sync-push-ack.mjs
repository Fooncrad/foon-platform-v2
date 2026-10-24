// Durable acknowledgment ledger for staged bidirectional sync.
// Requires an authenticated enrolled device and a pinned cloud public key.
// Caller must use a transaction-bound mysql2 connection, never a pool.
import {verifyCommittedPushReceipt} from "./bidirectional-sync-push-receipt.mjs";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sameUuid=(a,b)=>typeof a==="string"&&typeof b==="string"&&uuid.test(a)&&uuid.test(b)&&a.toLowerCase()===b.toLowerCase();
export async function persistVerifiedPushAcknowledgment({db,payload,expected,deviceId,publicKey}){
 const verified=verifyCommittedPushReceipt({payload,expected,deviceId,publicKey});
 if(!db||typeof db.execute!=="function"||typeof db.beginTransaction!=="function"||typeof db.commit!=="function"||typeof db.rollback!=="function")throw Error("SYNC_TRANSACTION_REQUIRED");
 await db.beginTransaction();
 let committed=false;
 try{
  const r=verified.receipt;
  const [pending]=await db.execute("SELECT tenant_id,branch_id,payload_digest,state,acknowledged_version FROM foon_sync_pending_events WHERE device_id=? AND event_id=? FOR UPDATE",[deviceId,r.eventId]);
  if(pending.length!==1)throw Error("SYNC_OUTBOX_EVENT_MISSING");
  const queued=pending[0];
  if(!sameUuid(queued.tenant_id,r.tenantId)||!sameUuid(queued.branch_id,r.branchId)||queued.payload_digest!==r.digest)throw Error("SYNC_OUTBOX_SCOPE_MISMATCH");
  if(verified.status==="conflict"){
   if(queued.state==="acknowledged")throw Error("SYNC_OUTBOX_ACK_CONFLICT");
   if(queued.state==="pending"){
    const [marked]=await db.execute("UPDATE foon_sync_pending_events SET state='conflict' WHERE device_id=? AND event_id=? AND tenant_id=? AND branch_id=? AND payload_digest=? AND state='pending'",[deviceId,r.eventId,r.tenantId,r.branchId,r.digest]);
    if(marked?.affectedRows!==1)throw Error("SYNC_OUTBOX_CONFLICT_WRITE_FAILED");
   }
   await db.commit();committed=true;
   return {status:"conflict",eventId:r.eventId};
  }
  if(queued.state==="conflict")throw Error("SYNC_OUTBOX_CONFLICT_REVIEW_REQUIRED");
  if(queued.state==="acknowledged"&&Number(queued.acknowledged_version)!==r.nextVersion)throw Error("SYNC_OUTBOX_ACK_CONFLICT");
  const [existing]=await db.execute("SELECT payload_digest,next_version,signature FROM foon_sync_push_acknowledgments WHERE device_id=? AND event_id=? FOR UPDATE",[deviceId,r.eventId]);
  if(existing.length){
   if(existing[0].payload_digest!==r.digest||Number(existing[0].next_version)!==r.nextVersion||existing[0].signature!==r.signature)throw Error("SYNC_ACK_CONFLICT");
  }else{
   const [written]=await db.execute("INSERT INTO foon_sync_push_acknowledgments(device_id,event_id,tenant_id,branch_id,payload_digest,next_version,signature) VALUES (?,?,?,?,?,?,?)",[deviceId,r.eventId,r.tenantId,r.branchId,r.digest,r.nextVersion,r.signature]);
   if(written?.affectedRows!==1)throw Error("SYNC_ACK_WRITE_FAILED");
  }
  if(queued.state!=="acknowledged"){
   const [marked]=await db.execute("UPDATE foon_sync_pending_events SET state='acknowledged',acknowledged_version=? WHERE device_id=? AND event_id=? AND tenant_id=? AND branch_id=? AND payload_digest=? AND state='pending'",[r.nextVersion,deviceId,r.eventId,r.tenantId,r.branchId,r.digest]);
   if(marked?.affectedRows!==1)throw Error("SYNC_OUTBOX_ACK_UPDATE_FAILED");
  }
  await db.commit();
  committed=true;
  return {status:"acknowledged",eventId:r.eventId,nextVersion:r.nextVersion};
 }finally{
  if(!committed)await db.rollback();
 }
}
