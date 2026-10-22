// Trusted adapter for authenticated device sessions. NOT an HTTP handler.
// Sync event recording is NOT a business-entity mutation. Mutations must be
// implemented in typed, authorized adapters inside the same transaction.
import {authorizeSyncPush,authorizeSyncPull,filterAuthorizedSyncEvents} from "./bidirectional-sync-authorization.mjs";
import {appendScopedChange,pullScopedChanges} from "./bidirectional-sync-journal.mjs";
import {prepareSyncPullEvents} from "./bidirectional-sync-feed.mjs";
import {signAuthorizedPullBatch} from "./bidirectional-sync-server-signer.mjs";
export async function recordAuthorizedChange({db,verifiedContext,change,applyBusinessChange}){
 if(typeof applyBusinessChange!=="function")throw Error("SYNC_BUSINESS_ADAPTER_REQUIRED");
 const authorized=authorizeSyncPush(verifiedContext,change);
 if(!db||typeof db.beginTransaction!=="function"||typeof db.commit!=="function"||typeof db.rollback!=="function")throw Error("SYNC_TRANSACTION_REQUIRED");
 await db.beginTransaction();
 let committed=false;
 try{
  // The adapter runs only if a candidate is not a replay/conflict.
  // appendScopedChange registers the event. Any failed business write MUST roll back both.
  const result=await appendScopedChange(db,authorized);
  if(result.status!=="recorded")return result;
  const applied=await applyBusinessChange(db,authorized.change);
  if(applied!==true)throw Error("SYNC_BUSINESS_APPLY_UNCONFIRMED");
  await db.commit();
  committed=true;
  return result;
 }catch(error){
  throw error;
 }finally{
  // The connection must end the transaction after every non-committed path.
  // A failed COMMIT also leaves the transaction in an uncertain state.
  if(!committed)await db.rollback();
 }
}
export async function readAuthorizedChanges({db,verifiedContext,request}){
 const scope=authorizeSyncPull(verifiedContext,request);
 const batch=await pullScopedChanges(db,scope);
 const permitted=filterAuthorizedSyncEvents(verifiedContext,batch.events);
 return {...batch,events:prepareSyncPullEvents(permitted,scope)};
}

export async function readSignedAuthorizedChanges({db,verifiedContext,request,privateKey}){
 const batch=await readAuthorizedChanges({db,verifiedContext,request});
 return signAuthorizedPullBatch({
  batch:{ok:true,tenantId:verifiedContext.tenantId,branchId:verifiedContext.branchId,events:batch.events,nextCursor:batch.nextCursor},
  scope:{deviceId:verifiedContext.deviceId,tenantId:verifiedContext.tenantId,branchId:verifiedContext.branchId,after:request.after??0,limit:request.limit??100},
  privateKey
 });
}
