import {createHmac,randomUUID} from "node:crypto";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";

export type PublicVisitKind="storefront"|"product"|"profile";
export const publicVisitorCookie="foon_public_visit";
export const publicVisitorCookieOptions={httpOnly:true as const,sameSite:"lax" as const,path:"/" as const,maxAge:60*60*24*30};
export const validVisitId=(value:unknown)=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function publicVisitorToken(value:unknown){
 return validVisitId(value)?value as string:randomUUID();
}
export function isVisitRobot(agent:string){
 return /bot|crawler|spider|headless|lighthouse|pagespeed|preview|facebookexternalhit|curl|wget|python-requests|uptime|monitor|linkchecker/i.test(agent);
}
export function visitorFingerprint(_request:Request,viewerId:string|null,anonymousToken?:string){
 const secret=process.env.AUTH_SECRET||process.env.NEXTAUTH_SECRET||process.env.SESSION_SECRET;
 if(!secret)throw new Error("VISIT_SECRET_UNAVAILABLE");
 // The pseudonymous token is browser-scoped, never derived from IP/geolocation.
 const identity=anonymousToken?"browser:"+anonymousToken:viewerId?"user:"+viewerId:"unattributed";
 return createHmac("sha256",secret).update(identity).digest("hex");
}
export async function recordPublicVisit(kind:PublicVisitKind,tenantId:string,resourceId:string,ownerUserId:string,fingerprint:string){
 await database().execute(
  "INSERT IGNORE INTO public_visit_daily (kind,tenant_id,resource_id,owner_user_id,visit_date,visitor_hash) VALUES (?,?,?,?,DATE(UTC_TIMESTAMP()+INTERVAL 3 HOUR),?)",
  [kind,tenantId,resourceId,ownerUserId,fingerprint]
 );
}
export async function countPublicVisits(kind:PublicVisitKind,tenantId:string,resourceId:string,ownerUserId:string){
 const today="DATE(UTC_TIMESTAMP()+INTERVAL 3 HOUR)";
 const [rows]=await database().execute<RowDataPacket[]>(
  "SELECT COUNT(*) AS total, SUM(visit_date="+today+") AS today, "+
  "SUM(visit_date>=DATE_SUB("+today+",INTERVAL 6 DAY)) AS last7Days, "+
  "SUM(visit_date>=DATE_SUB("+today+",INTERVAL 29 DAY)) AS last30Days "+
  "FROM public_visit_daily WHERE kind=? AND tenant_id=? AND resource_id=? AND owner_user_id=?",
  [kind,tenantId,resourceId,ownerUserId]
 );
 return {total:Number(rows[0]?.total||0),today:Number(rows[0]?.today||0),last7Days:Number(rows[0]?.last7Days||0),last30Days:Number(rows[0]?.last30Days||0)};
}
