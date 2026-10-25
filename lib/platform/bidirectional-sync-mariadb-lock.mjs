// Cross-process Windows sync lock, held by a dedicated MariaDB connection.
// GET_LOCK is session-scoped: do not return the connection to the pool until
// RELEASE_LOCK has completed; process termination releases the lock in MariaDB.
import {createHash} from "node:crypto";
import {pushBoundedPendingSyncEvents} from "./bidirectional-sync-push-pass.mjs";
// mysql2 returns numeric or canonical decimal lock results. Never coerce
// malformed/unknown responses into proof of acquisition or release.
const isLockResult=value=>value===0||value===1||value==="0"||value==="1";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function pushWithMariaDbDeviceLock({pool,scope,...options}){
 if(!pool||typeof pool.getConnection!=="function"||![scope?.deviceId,scope?.tenantId,scope?.branchId].every(v=>typeof v==="string"&&uuid.test(v)))throw Error("SYNC_INVALID_LOCK_CONTEXT");
 // MySQL UUID scope comparisons are case-insensitive. Use the same advisory
 // lock name for mixed-case spellings across independent Windows processes.
 const name="foon:win:push:"+createHash("sha256").update(JSON.stringify([scope.deviceId,scope.tenantId,scope.branchId].map(id=>id.toLowerCase()))).digest("hex").slice(0,40);
 const db=await pool.getConnection();
 let acquired=false;
 let acquisitionConfirmed=false;
 try{
  const [rows]=await db.execute("SELECT GET_LOCK(?,0) AS acquired",[name]);
  if(!Array.isArray(rows)||rows.length!==1||!isLockResult(rows[0]?.acquired))throw Error("SYNC_LOCK_STATE_UNKNOWN");
  acquisitionConfirmed=true;
  if(rows[0].acquired!==1&&rows[0].acquired!=="1")throw Error("SYNC_PUSH_ALREADY_RUNNING");
  acquired=true;
  return await pushBoundedPendingSyncEvents({db,scope,...options});
 }finally{
  // An interrupted GET_LOCK call may have acquired a lock on the server
  // even though the client never received the result. Destroy such sessions.
  let safeToPool=acquisitionConfirmed&&!acquired;
  try{
   if(acquired){
    const [rows]=await db.execute("SELECT RELEASE_LOCK(?) AS released",[name]);
    if(!Array.isArray(rows)||rows.length!==1||(rows[0]?.released!==1&&rows[0]?.released!=="1"))throw Error("SYNC_LOCK_RELEASE_FAILED");
    safeToPool=true;
   }
  }finally{
   if(safeToPool){if(typeof db.release==="function")db.release();}
   else if(typeof db.destroy==="function")db.destroy();
  }
 }
}
