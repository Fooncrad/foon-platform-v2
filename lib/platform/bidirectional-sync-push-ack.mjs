// Durable acknowledgment ledger for staged bidirectional sync.
// Requires an authenticated enrolled device and a pinned cloud public key.
// Caller must use a transaction-bound mysql2 connection, never a pool.
import {verifyCommittedPushReceipt} from "./bidirectional-sync-push-receipt.mjs";
export async function persistVerifiedPushAcknowledgment({db,payload,expected,deviceId,publicKey}){
 const verified=verifyCommittedPushReceipt({payload,expected,deviceId,publicKey});
 if(!db||typeof db.execute!=="function"||typeof db.beginTransaction!=="function"||typeof db.commit!=="function"||typeof db.rollback!=="function")throw Error("SYNC_TRANSACTION_REQUIRED");
 if(verified.status==="conflict")return {status:"conflict",eventId:expected.eventId};
 await db.beginTransaction();
 let committed=false;
 try{
  const r=verified.receipt;
  const [existing]=await db.execute("SELECT payload_digest,next_version,signature FROM foon_sync_push_acknowledgments WHERE device_id=? AND event_id=? FOR UPDATE",[deviceId,r.eventId]);
  if(existing.length){
   if(existing[0].payload_digest!==r.digest||Number(existing[0].next_version)!==r.nextVersion||existing[0].signature!==r.signature)throw Error("SYNC_ACK_CONFLICT");
  }else{
   const [written]=await db.execute("INSERT INTO foon_sync_push_acknowledgments(device_id,event_id,tenant_id,branch_id,payload_digest,next_version,signature) VALUES (?,?,?,?,?,?,?)",[deviceId,r.eventId,r.tenantId,r.branchId,r.digest,r.nextVersion,r.signature]);
   if(written?.affectedRows!==1)throw Error("SYNC_ACK_WRITE_FAILED");
  }
  await db.commit();
  committed=true;
  return {status:"acknowledged",eventId:r.eventId,nextVersion:r.nextVersion};
 }finally{
  if(!committed)await db.rollback();
 }
}
