// Cross-process Windows sync lock, held by a dedicated MariaDB connection.
// GET_LOCK is session-scoped: do not return the connection to the pool until
// RELEASE_LOCK has completed; process termination releases the lock in MariaDB.
import {createHash} from "node:crypto";
import {pushBoundedPendingSyncEvents} from "./bidirectional-sync-push-pass.mjs";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function pushWithMariaDbDeviceLock({pool,scope,...options}){
 if(!pool||typeof pool.getConnection!=="function"||![scope?.deviceId,scope?.tenantId,scope?.branchId].every(v=>typeof v==="string"&&uuid.test(v)))throw Error("SYNC_INVALID_LOCK_CONTEXT");
 const name="foon:win:push:"+createHash("sha256").update(JSON.stringify([scope.deviceId,scope.tenantId,scope.branchId])).digest("hex").slice(0,40);
 const db=await pool.getConnection();
 let acquired=false;
 try{
  const [rows]=await db.execute("SELECT GET_LOCK(?,0) AS acquired",[name]);
  if(!Array.isArray(rows)||rows.length!==1||Number(rows[0].acquired)!==1)throw Error("SYNC_PUSH_ALREADY_RUNNING");
  acquired=true;
  return await pushBoundedPendingSyncEvents({db,scope,...options});
 }finally{
  try{
   if(acquired){
    const [rows]=await db.execute("SELECT RELEASE_LOCK(?) AS released",[name]);
    if(!Array.isArray(rows)||rows.length!==1||Number(rows[0].released)!==1){
     if(typeof db.destroy==="function")db.destroy();
     throw Error("SYNC_LOCK_RELEASE_FAILED");
    }
   }
  }finally{if(typeof db.release==="function")db.release();}
 }
}
