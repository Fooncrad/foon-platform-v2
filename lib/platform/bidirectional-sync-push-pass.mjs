// Explicit bounded Windows push pass. Does not start a timer or enable live sync.
// Stop on a conflict: operator review is needed before continuing dependent edits.
import {pushNextPendingSyncEvent} from "./bidirectional-sync-push-worker.mjs";
export async function pushBoundedPendingSyncEvents({db,scope,url,authorization,publicKey,fetchImpl,timeoutSignal,maxEvents=20}){
 if(!Number.isSafeInteger(maxEvents)||maxEvents<1||maxEvents>100)throw Error("SYNC_INVALID_PUSH_LIMIT");
 const result={acknowledged:0,conflicts:0,status:"idle"};
 for(let count=0;count<maxEvents;count++){
  // Any transport, DB, or signature error must propagate to the runner; never
  // claim a successful batch while an event remains unverified.
  const pushed=await pushNextPendingSyncEvent({db,scope,url,authorization,publicKey,fetchImpl,timeoutSignal});
  if(pushed.status==="idle")return result;
  if(pushed.status==="conflict"){
   result.conflicts++;
   result.status="review_required";
   return result;
  }
  if(pushed.status!=="acknowledged")throw Error("SYNC_UNEXPECTED_PUSH_STATUS");
  result.acknowledged++;
  result.status="progress";
 }
 return result;
}
