// Server-side enrolled-device credential verification.
// Never accept device grants or tenant scope from request JSON.
// A credential is <device UUID>.<32+ random base64url bytes>.
import {createHash,timingSafeEqual} from "node:crypto";
import {validateVerifiedDeviceContext} from "./bidirectional-sync-authorization.mjs";
const tokenPattern=/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.([A-Za-z0-9_-]{43,})$/i;
export async function authenticateEnrolledSyncDevice(db,credential){
 const match=typeof credential==="string"?tokenPattern.exec(credential):null;
 if(!match||typeof db?.execute!=="function")throw Error("SYNC_AUTH_REQUIRED");
 const [rows]=await db.execute("SELECT device_id,tenant_id,branch_id,actor_id,token_sha256,enabled,revoked,suspended,expires_at,grants_json FROM foon_sync_devices WHERE device_id=? LIMIT 1",[match[1]]);
 if(!Array.isArray(rows)||rows.length!==1)throw Error("SYNC_AUTH_REQUIRED");
 const row=rows[0];
 const expected=Buffer.from(String(row.token_sha256||""),"hex");
 const actual=createHash("sha256").update(credential).digest();
 if(expected.length!==32||!timingSafeEqual(actual,expected))throw Error("SYNC_AUTH_REQUIRED");
 let grants;try{grants=typeof row.grants_json==="string"?JSON.parse(row.grants_json):row.grants_json;}catch{throw Error("SYNC_INVALID_GRANTS");}
 return validateVerifiedDeviceContext({
  authenticated:true,deviceId:row.device_id,tenantId:row.tenant_id,
  branchId:row.branch_id,actorId:row.actor_id,grants,
  enabled:row.enabled===1||row.enabled===true,
  revoked:row.revoked===1||row.revoked===true,
  suspended:row.suspended===1||row.suspended===true,
  expiresAt:row.expires_at instanceof Date?row.expires_at.toISOString():String(row.expires_at)
 });
}
