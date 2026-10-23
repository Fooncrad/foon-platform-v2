// Explicit bounded Windows push pass. Does not start a timer or enable live sync.
// Stop on a conflict: operator review is needed before continuing dependent edits.
import {pushNextPendingSyncEvent} from "./bidirectional-sync-push-worker.mjs";
const activeScopes=new Set();
export async function pushBoundedPendingSyncEvents({db,scope,url,authorization,publicKey,fetchImpl,timeoutSignal,maxEvents=20}){
 if(!Number.isSafeInteger(maxEvents)||maxEvents<1||maxEvents>100)throw Error("SYNC_INVALID_PUSH_LIMIT");
 if(!scope||typeof scope.deviceId!=="string"||typeof scope.tenantId!=="string"||typeof scope.branchId!=="string")throw Error("SYNC_INVALID_PUSH_SCOPE");
 const lockKey=JSON.stringify([scope.deviceId,scope.tenantId,scope.branchId]);
 if(activeScopes.has(lockKey))throw Error("SYNC_PUSH_ALREADY_RUNNING");
 activeScopes.add(lockKey);
 try{
 const result={acknowledged:0,conflicts:0,status:"idle"};
 const visited=new Set();
 for(let count=0;count<maxEvents;count++){
  // Any transport, DB, or signature error must propagate to the runner; never
  // claim a successful batch while an event remains unverified.
  const pushed=await pushNextPendingSyncEvent({db,scope,url,authorization,publicKey,fetchImpl,timeoutSignal});
  if(pushed.status==="idle")return result;
  if(!pushed.eventId||visited.has(pushed.eventId))throw Error("SYNC_PUSH_REPEATED_EVENT");
  visited.add(pushed.eventId);
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
 }finally{activeScopes.delete(lockKey)}
}
