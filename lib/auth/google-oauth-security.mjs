import {timingSafeEqual} from "node:crypto";

export const GOOGLE_OAUTH_COOKIE_PATH="/api/auth/google";

export function validGoogleOauthState(incoming,saved){
 if(typeof incoming!=="string"||typeof saved!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(incoming)||!/^[A-Za-z0-9_-]{43}$/.test(saved))return false;
 const actual=Buffer.from(incoming,"utf8"),expected=Buffer.from(saved,"utf8");
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

export function canUseGoogleLinkedAccount(user){
 return user?.status==="active"&&user?.email_verified_at!==null&&user?.email_verified_at!==undefined;
}
