import {createHash,randomBytes,timingSafeEqual} from "node:crypto";

/** Opaque, single-use OAuth state; persist only the SHA-256 digest.
 * Database consumption must be atomic: UPDATE ... WHERE consumed_at IS NULL
 * AND expires_at > NOW() AND tenant_id=? AND user_id=? AND provider=?.
 */
export function createMediaOAuthState() {
 const state=randomBytes(32).toString("base64url");
 return {state,stateHash:hashMediaOAuthState(state)};
}

export function hashMediaOAuthState(state:string) {
 if(typeof state!=="string"||!(/^[A-Za-z0-9_-]{43}$/.test(state)))throw new Error("INVALID_MEDIA_OAUTH_STATE");
 return createHash("sha256").update(state,"utf8").digest("hex");
}

export function constantTimeMediaStateMatch(state:string,expectedHash:string) {
 if(!/^[a-f0-9]{64}$/.test(expectedHash))return false;
 try {
  const actual=Buffer.from(hashMediaOAuthState(state),"hex");
  return timingSafeEqual(actual,Buffer.from(expectedHash,"hex"));
 } catch {return false;}
}

export const MEDIA_OAUTH_STATE_TTL_SECONDS=600;

/** Only internal paths are allowed after a completed OAuth exchange. */
export function mediaOAuthRedirectPath(tenantId:string) {
 if(!/^[a-zA-Z0-9_-]{1,64}$/.test(tenantId))throw new Error("INVALID_TENANT_ID");
 return "/restaurant/media-studio?tenant="+encodeURIComponent(tenantId);
}

/** A consumed state is never accepted again, even before expiry. */
export function isMediaOAuthStateUsable(row:{
 tenant_id:string;user_id:string;provider:string;state_hash:string;
 expires_at:Date|string;consumed_at:Date|string|null;
}, context:{tenantId:string;userId:string;provider:string;state:string}, now=new Date()) {
 const expiry=new Date(row.expires_at).getTime();
 return row.tenant_id===context.tenantId&&row.user_id===context.userId&&
  row.provider===context.provider&&row.consumed_at==null&&
  Number.isFinite(expiry)&&expiry>now.getTime()&&
  constantTimeMediaStateMatch(context.state,row.state_hash);
}
