// Admin-only, transaction-bound enrollment. Authorization MUST be established
// by the calling admin API and never inferred from caller-supplied IDs.
import {randomBytes,createHash,randomUUID} from "node:crypto";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const allowed=new Set(["sync.read","catalog.read","catalog.write","media.read","media.write","inventory.read","inventory.write","orders.read","orders.write","reservations.read","reservations.write","waitlist.read","waitlist.write","tables.read","tables.write","customers.read","customers.write","settings.read","settings.write","staff.read","staff.write"]);
function validateAdminScope(scope){
 if(!scope||scope.verifiedServerSide!==true||!uuid.test(scope.tenantId)||!uuid.test(scope.branchId)||!uuid.test(scope.actorId))throw Error("SYNC_ENROLLMENT_FORBIDDEN");
}
async function resolveAdminScope(authorizeAdmin,session){
 if(typeof authorizeAdmin!=="function")throw Error("SYNC_ADMIN_AUTHENTICATOR_REQUIRED");
 const scope=await authorizeAdmin(session);
 validateAdminScope(scope);
 return scope;
}
export async function enrollSyncDevice({db,authorizeAdmin,session,grants,expiresAt,deviceId=randomUUID()}){
 const adminScope=await resolveAdminScope(authorizeAdmin,session);
 if(!uuid.test(deviceId)||!Array.isArray(grants)||grants.length<1||grants.some(g=>!allowed.has(g))||new Set(grants).size!==grants.length)throw Error("SYNC_INVALID_ENROLLMENT");
 const expiry=Date.parse(expiresAt);
 if(typeof expiresAt!=="string"||!Number.isFinite(expiry)||expiry<=Date.now()||expiry>Date.now()+366*86400000)throw Error("SYNC_INVALID_EXPIRY");
 if(!db||typeof db.execute!=="function"||typeof db.beginTransaction!=="function"||typeof db.commit!=="function"||typeof db.rollback!=="function")throw Error("SYNC_TRANSACTION_REQUIRED");
 const credential=deviceId+"."+randomBytes(32).toString("base64url");
 const digest=createHash("sha256").update(credential).digest("hex");
 await db.beginTransaction();let committed=false;
 try{
  const [r]=await db.execute("INSERT INTO foon_sync_devices(device_id,tenant_id,branch_id,actor_id,token_sha256,grants_json,enabled,revoked,suspended,expires_at) VALUES (?,?,?,?,?,?,1,0,0,?)",[deviceId,adminScope.tenantId,adminScope.branchId,adminScope.actorId,digest,JSON.stringify(grants),new Date(expiry)]);
  if(r?.affectedRows!==1)throw Error("SYNC_ENROLLMENT_WRITE_FAILED");
  await db.commit();committed=true;
  // The raw credential is returned ONCE. Do not log or persist it as plaintext.
  return {deviceId,credential,expiresAt:new Date(expiry).toISOString()};
 }finally{if(!committed)await db.rollback();}
}
export async function revokeSyncDevice({db,authorizeAdmin,session,deviceId}){
 const adminScope=await resolveAdminScope(authorizeAdmin,session);
 if(!uuid.test(deviceId)||!db||typeof db.execute!=="function")throw Error("SYNC_ENROLLMENT_FORBIDDEN");
 const [r]=await db.execute("UPDATE foon_sync_devices SET revoked=1,enabled=0 WHERE device_id=? AND tenant_id=? AND branch_id=? AND revoked=0",[deviceId,adminScope.tenantId,adminScope.branchId]);
 if(r?.affectedRows!==1)throw Error("SYNC_DEVICE_NOT_FOUND_OR_REVOKED");
 return {status:"revoked",deviceId};
}
