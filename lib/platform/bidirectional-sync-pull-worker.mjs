// Explicit one-shot Windows pull. No timers, no live worker activation.
// A signed batch is applied and its cursor advanced inside one local transaction.
import {createPublicKey} from "node:crypto";
import {requestScopedSyncPull} from "./bidirectional-sync-pull-client.mjs";
import {applyVerifiedPullBatch} from "./bidirectional-sync-local-receiver.mjs";
const activePullScopes=new Set();
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
// mysql2 may return BIGINT cursors as decimal strings; reject implicit coercion.
const validStoredCursor=value=>(typeof value==="number"&&Number.isSafeInteger(value)&&value>=0)||(typeof value==="string"&&/^(0|[1-9][0-9]*)$/.test(value)&&Number.isSafeInteger(Number(value)));
export async function pullAndApplyNextSyncBatch({db,scope,baseUrl,authorization,publicKey,applyEvent,limit=100,fetchImpl,timeoutSignal}){
 if(!db||typeof db.execute!=="function"||!scope||typeof scope!=="object"||Array.isArray(scope)||![scope.deviceId,scope.tenantId,scope.branchId].every(id=>typeof id==="string"&&uuid.test(id)))throw Error("SYNC_INVALID_PULL_SCOPE");
 // Fail before reading the cursor or contacting cloud when the local write path
 // cannot atomically apply changes and persist the cursor.
 if(typeof applyEvent!=="function")throw Error("SYNC_LOCAL_ADAPTER_REQUIRED");
 if(typeof db.beginTransaction!=="function"||typeof db.commit!=="function"||typeof db.rollback!=="function")throw Error("SYNC_TRANSACTION_REQUIRED");
 // A missing or non-Ed25519 pinned server key must fail before reading the
 // local cursor or transmitting the device bearer token to Cloud.
 let trustedKey;
 try{trustedKey=createPublicKey(publicKey);}catch{throw Error("SYNC_TRUSTED_KEY_REQUIRED");}
 if(trustedKey.asymmetricKeyType!=="ed25519")throw Error("SYNC_TRUSTED_KEY_REQUIRED");
 // Prevent overlapping pulls from reading the same cursor and racing to
 // apply the same signed order, inventory or reservation batch. UUID scope
 // identity is case-insensitive in MySQL, so normalize it for this lock.
 const lockKey=JSON.stringify([scope.deviceId,scope.tenantId,scope.branchId].map(id=>id.toLowerCase()));
 if(activePullScopes.has(lockKey))throw Error("SYNC_PULL_ALREADY_RUNNING");
 activePullScopes.add(lockKey);
 try{
 const [rows]=await db.execute("SELECT last_pulled_id FROM foon_sync_device_cursors WHERE device_id=? AND tenant_id=? AND branch_id=?",[scope.deviceId,scope.tenantId,scope.branchId]);
 if(!Array.isArray(rows)||rows.length!==1)throw Error("SYNC_CURSOR_NOT_PROVISIONED");
 const rawCursor=rows[0]?.last_pulled_id;
 if(!validStoredCursor(rawCursor))throw Error("SYNC_INVALID_CURSOR");
 const after=Number(rawCursor);
 const response=await requestScopedSyncPull({baseUrl,scope,after,limit,authorization,fetchImpl,timeoutSignal});
 const {signature,...batch}=response;
 // The server response is untrusted until verified against the pinned key.
 // applyVerifiedPullBatch also performs version/digest checks and a CAS cursor update.
 // Keep the in-process scope lock until the local transaction settles.
 return await applyVerifiedPullBatch({db,batch,scope:{...scope,after,limit},signature,publicKey,applyEvent});
 }finally{
  activePullScopes.delete(lockKey);
 }
}
