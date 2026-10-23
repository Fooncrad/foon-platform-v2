// Explicit one-shot Windows pull. No timers, no live worker activation.
// A signed batch is applied and its cursor advanced inside one local transaction.
import {requestScopedSyncPull} from "./bidirectional-sync-pull-client.mjs";
import {applyVerifiedPullBatch} from "./bidirectional-sync-local-receiver.mjs";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function pullAndApplyNextSyncBatch({db,scope,baseUrl,authorization,publicKey,applyEvent,limit=100,fetchImpl,timeoutSignal}){
 if(!db||typeof db.execute!=="function"||!uuid.test(scope?.deviceId)||!uuid.test(scope?.tenantId)||!uuid.test(scope?.branchId))throw Error("SYNC_INVALID_PULL_SCOPE");
 const [rows]=await db.execute("SELECT last_pulled_id FROM foon_sync_device_cursors WHERE device_id=? AND tenant_id=? AND branch_id=?",[scope.deviceId,scope.tenantId,scope.branchId]);
 if(!Array.isArray(rows)||rows.length!==1)throw Error("SYNC_CURSOR_NOT_PROVISIONED");
 const after=Number(rows[0].last_pulled_id);
 if(!Number.isSafeInteger(after)||after<0)throw Error("SYNC_INVALID_CURSOR");
 const response=await requestScopedSyncPull({baseUrl,scope,after,limit,authorization,fetchImpl,timeoutSignal});
 const {signature,...batch}=response;
 // The server response is untrusted until verified against the pinned key.
 // applyVerifiedPullBatch also performs version/digest checks and a CAS cursor update.
 return applyVerifiedPullBatch({db,batch,scope:{...scope,after,limit},signature,publicKey,applyEvent});
}
