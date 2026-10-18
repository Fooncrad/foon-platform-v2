import type { RowDataPacket } from "mysql2/promise";
import { database } from "@/lib/db/mysql";
import { tenantId, type TenantId } from "@/lib/tenant/scope";
import { currentSessionId } from "./session";
import type { PlatformRole, TenantRole } from "./roles";

export async function requireTenantMembership(userId:string, rawTenantId:string, allowed:readonly TenantRole[],touchAdminSession=true){
  const id:TenantId=tenantId(rawTenantId);
 // Admin access is explicit, tenant-scoped, audited, time-limited, and tied to
 // the current login session. Platform roles alone never grant tenant access.
 const sessionId=await currentSessionId();
 const [platformAdmins]=await database().execute<RowDataPacket[]>(
  "SELECT role FROM platform_admins WHERE user_id=? AND enabled=TRUE LIMIT 1",[userId]
 );
 if(platformAdmins.length){
  console.error("[tenant-support-debug] platform administrator identified; session present:",Boolean(sessionId));
  if(!sessionId)throw new Error("FORBIDDEN");
  const [support]=await database().execute<RowDataPacket[]>(
   "SELECT s.id,s.platform_role,pa.role AS current_role FROM platform_tenant_support_sessions s JOIN auth_sessions a ON a.id=s.auth_session_id AND a.user_id=s.actor_user_id AND a.expires_at>UTC_TIMESTAMP() AND a.last_seen_at>DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 MINUTE) JOIN platform_admins pa ON pa.user_id=s.actor_user_id AND pa.enabled=TRUE JOIN users u ON u.id=s.actor_user_id AND u.status='active' JOIN tenants t ON t.id=s.tenant_id AND t.status='active' WHERE s.auth_session_id=? AND s.actor_user_id=? AND s.tenant_id=? AND s.ended_at IS NULL AND s.expires_at>UTC_TIMESTAMP() LIMIT 1",
   [sessionId,userId,id]
  );
  console.error("[tenant-support-debug] active support session matched:",Boolean(support.length));
  if(support.length){
   const role=String(support[0].platform_role)==="support"||String(support[0].current_role)==="support"?"support":"admin";
   if(!allowed.includes("manager")||touchAdminSession&&role==="support")throw new Error("FORBIDDEN");
   return {tenantId:id,role:"manager" as TenantRole,adminAccess:true,platformRole:role};
  }
  console.error("[tenant-support-debug] ordinary membership fallback");
  throw new Error("FORBIDDEN");
 }
  const [rows]=await database().execute<RowDataPacket[]>(
  "SELECT m.role FROM memberships m INNER JOIN users u ON u.id=m.user_id INNER JOIN tenants t ON t.id=m.tenant_id WHERE m.tenant_id=? AND m.user_id=? AND m.status='active' AND u.status='active' AND t.status='active' LIMIT 1",
    [id,userId]
  );
  const role=rows[0]?.role as TenantRole|undefined;
  if(!role)console.error("[tenant-support-debug] no active tenant membership matched");
  if(!role || !allowed.includes(role)) throw new Error("FORBIDDEN");
  return {tenantId:id,role,adminAccess:false as const};
}

export async function requirePlatformRole(userId:string, allowed:readonly PlatformRole[]){
  const [rows]=await database().execute<RowDataPacket[]>(
    "SELECT pa.role FROM platform_admins pa INNER JOIN users u ON u.id=pa.user_id WHERE pa.user_id=? AND pa.enabled=TRUE AND u.status='active' LIMIT 1",[userId]
  );
  const role=rows[0]?.role as PlatformRole|undefined;
  if(!role || !allowed.includes(role)) throw new Error("FORBIDDEN");
  return {role};
}
