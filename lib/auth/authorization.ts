import type { RowDataPacket } from "mysql2/promise";
import { database } from "@/lib/db/mysql";
import { tenantId, type TenantId } from "@/lib/tenant/scope";
import type { PlatformRole, TenantRole } from "./roles";

export async function requireTenantMembership(userId:string, rawTenantId:string, allowed:readonly TenantRole[]){
  const id:TenantId=tenantId(rawTenantId);
  const [rows]=await database().execute<RowDataPacket[]>(
    "SELECT role FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' LIMIT 1",
    [id,userId]
  );
  const role=rows[0]?.role as TenantRole|undefined;
  if(!role || !allowed.includes(role)) throw new Error("FORBIDDEN");
  return {tenantId:id,role};
}

export async function requirePlatformRole(userId:string, allowed:readonly PlatformRole[]){
  const [rows]=await database().execute<RowDataPacket[]>(
    "SELECT role FROM platform_admins WHERE user_id=? AND enabled=TRUE LIMIT 1",[userId]
  );
  const role=rows[0]?.role as PlatformRole|undefined;
  if(!role || !allowed.includes(role)) throw new Error("FORBIDDEN");
  return {role};
}
