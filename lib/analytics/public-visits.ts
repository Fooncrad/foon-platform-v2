import {createHmac} from "node:crypto";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";

export type PublicVisitKind="storefront"|"product"|"profile";
export function visitorFingerprint(request:Request,viewerId:string|null){
 const secret=process.env.AUTH_SECRET||process.env.NEXTAUTH_SECRET||process.env.SESSION_SECRET;
 if(!secret)throw new Error("VISIT_SECRET_UNAVAILABLE");
 // Prefer authenticated ID. Anonymous users are deduplicated daily using a
 // keyed digest; do not save the underlying network headers.
 const ip=(request.headers.get("x-forwarded-for")||"").split(",")[0].trim();
 const ua=(request.headers.get("user-agent")||"").slice(0,400);
 const language=(request.headers.get("accept-language")||"").slice(0,80);
 const identity=viewerId?"user:"+viewerId:"anon:"+ip+"|"+ua+"|"+language;
 return createHmac("sha256",secret).update(identity).digest("hex");
}
export async function recordPublicVisit(kind:PublicVisitKind,tenantId:string,resourceId:string,ownerUserId:string,fingerprint:string){
 await database().execute(
  "INSERT IGNORE INTO public_visit_daily (kind,tenant_id,resource_id,owner_user_id,visit_date,visitor_hash) VALUES (?,?,?,?,UTC_DATE(),?)",
  [kind,tenantId,resourceId,ownerUserId,fingerprint]
 );
}
export async function countPublicVisits(kind:PublicVisitKind,tenantId:string,resourceId:string,ownerUserId:string){
 const [rows]=await database().execute<RowDataPacket[]>(
  "SELECT COUNT(*) AS total, SUM(visit_date=UTC_DATE()) AS today, SUM(visit_date>=UTC_DATE()-INTERVAL 6 DAY) AS last7Days, SUM(visit_date>=UTC_DATE()-INTERVAL 29 DAY) AS last30Days FROM public_visit_daily WHERE kind=? AND tenant_id=? AND resource_id=? AND owner_user_id=?",
  [kind,tenantId,resourceId,ownerUserId]
 );
 return {total:Number(rows[0]?.total||0),today:Number(rows[0]?.today||0),last7Days:Number(rows[0]?.last7Days||0),last30Days:Number(rows[0]?.last30Days||0)};
}
