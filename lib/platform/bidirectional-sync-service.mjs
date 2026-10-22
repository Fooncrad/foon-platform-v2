// Trusted adapter for authenticated device sessions. NOT an HTTP handler.
// Sync event recording is NOT a business-entity mutation. Mutations must be
// implemented in typed, authorized adapters inside the same transaction.
import {authorizeSyncPush,authorizeSyncPull,filterAuthorizedSyncEvents} from "./bidirectional-sync-authorization.mjs";
import {appendScopedChange,pullScopedChanges} from "./bidirectional-sync-journal.mjs";
import {prepareSyncPullEvents} from "./bidirectional-sync-feed.mjs";
export async function recordAuthorizedChange({db,verifiedContext,change,applyBusinessChange}){
 if(typeof applyBusinessChange!=="function")throw Error("SYNC_BUSINESS_ADAPTER_REQUIRED");
 const authorized=authorizeSyncPush(verifiedContext,change);
 if(!db||typeof db.beginTransaction!=="function"||typeof db.commit!=="function"||typeof db.rollback!=="function")throw Error("SYNC_TRANSACTION_REQUIRED");
 await db.beginTransaction();
 try{
  // The adapter runs only if a candidate is not a replay/conflict.
  // appendScopedChange registers the event. Any failed business write MUST roll back both.
  const result=await appendScopedChange(db,authorized);
  if(result.status!=="recorded"){await db.rollback();return result;}
  const applied=await applyBusinessChange(db,authorized.change);
  if(applied!==true)throw Error("SYNC_BUSINESS_APPLY_UNCONFIRMED");
  await db.commit();
  return result;
 }catch(error){
  await db.rollback();
  throw error;
 }
}
export async function readAuthorizedChanges({db,verifiedContext,request}){
 const scope=authorizeSyncPull(verifiedContext,request);
 const batch=await pullScopedChanges(db,scope);
 const permitted=filterAuthorizedSyncEvents(verifiedContext,batch.events);
 return {...batch,events:prepareSyncPullEvents(permitted,scope)};
}
