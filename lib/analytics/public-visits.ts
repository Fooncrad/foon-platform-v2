import {createHash,randomUUID} from "node:crypto";

export type PublicVisitKind="storefront"|"restaurant_item"|"catalog_product"|"creator_profile";
export const PUBLIC_VISIT_KINDS=new Set<PublicVisitKind>(["storefront","restaurant_item","catalog_product","creator_profile"]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validAnalyticsId=(value:unknown):value is string=>typeof value==="string"&&UUID.test(value);
export const validAnalyticsSlug=(value:unknown):value is string=>typeof value==="string"&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
export function visitFingerprint(token:string,kind:PublicVisitKind,subject:string,day:string){
 return createHash("sha256").update("foon-visit-v1\0"+token+"\0"+kind+"\0"+subject+"\0"+day).digest("hex");
}
export function isLikelyRobot(userAgent:string){
 return /bot|crawler|spider|headless|lighthouse|pagespeed|preview|facebookexternalhit|curl|wget|python-requests|uptime|monitor|linkchecker/i.test(userAgent);
}
export const visitorCookieName="foon_public_visit";
export const visitorCookieOptions={
 httpOnly:true as const,
 sameSite:"lax" as const,
 path:"/" as const,
 maxAge:60*60*24*30
};
export function visitorToken(old:string|undefined){
 return old&&validAnalyticsId(old)?old:randomUUID();
}
