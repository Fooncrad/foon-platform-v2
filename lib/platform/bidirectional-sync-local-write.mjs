// Local write coordinator: business mutation and event enqueue must share the
// same mysql2 connection and transaction. Not wired to production endpoints.
import {validateChangeEnvelope} from "./bidirectional-sync-contract.mjs";
import {enqueueScopedSyncEvent} from "./bidirectional-sync-outbox.mjs";
export async function recordLocalBusinessChange({db,change,deviceId,applyBusinessChange}){
 const event=validateChangeEnvelope(change);
 if(typeof applyBusinessChange!=="function")throw Error("SYNC_BUSINESS_ADAPTER_REQUIRED");
 if(!db||typeof db.beginTransaction!=="function"||typeof db.commit!=="function"||typeof db.rollback!=="function"||typeof db.execute!=="function")throw Error("SYNC_TRANSACTION_REQUIRED");
 await db.beginTransaction();
 let committed=false;
 try{
  // Check replay before running business code. Device scope and digest are
  // checked by the outbox adapter under row lock.
  const queued=await enqueueScopedSyncEvent(db,{change:event,deviceId});
  if(queued.status==="duplicate")return queued;
  if(await applyBusinessChange(db,event)!==true)throw Error("SYNC_BUSINESS_APPLY_UNCONFIRMED");
  await db.commit();
  committed=true;
  return queued;
 }finally{
  if(!committed)await db.rollback();
 }
}
