// Explicit, single-event push attempt. No timers, no automatic production sync.
// Preserve the outbox event on network errors and unverified responses.
import {readPendingSyncEvents} from "./bidirectional-sync-outbox.mjs";
import {digestChange} from "./bidirectional-sync-contract.mjs";
import {requestSyncJson} from "./bidirectional-sync-transport.mjs";
import {persistVerifiedPushAcknowledgment} from "./bidirectional-sync-push-ack.mjs";
export async function pushNextPendingSyncEvent({db,scope,url,authorization,publicKey,fetchImpl,timeoutSignal}){
 if(!db||typeof db.execute!=="function")throw Error("SYNC_DATABASE_REQUIRED");
 const events=await readPendingSyncEvents(db,{deviceId:scope?.deviceId,tenantId:scope?.tenantId,branchId:scope?.branchId,limit:1});
 if(events.length===0)return {status:"idle"};
 const change=events[0];
 const expected={eventId:change.eventId,tenantId:change.tenantId,branchId:change.branchId,digest:digestChange(change)};
 // The server must verify the enrolled device and apply this change in a
 // durable business transaction. No receipt is trusted before signature check.
 const response=await requestSyncJson({url,method:"POST",authorization,body:{change},fetchImpl,timeoutSignal});
 const result=await persistVerifiedPushAcknowledgment({db,payload:response,expected,deviceId:scope.deviceId,publicKey});
 return {status:result.status,eventId:change.eventId};
}
