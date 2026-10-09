import type { RowDataPacket } from "mysql2/promise";
import {canAccessAllTenants} from "@/scripts/admin-policy.mjs";
import {currentActiveAdminUserId} from "./session";
import { database } from "@/lib/db/mysql";
import { tenantId, type TenantId } from "@/lib/tenant/scope";
import type { PlatformRole, TenantRole } from "./roles";

export async function requireTenantMembership(userId:string, rawTenantId:string, allowed:readonly TenantRole[],touchAdminSession=true){
  const id:TenantId=tenantId(rawTenantId);
  const admin=await currentActiveAdminUserId(touchAdminSession);
  if(admin===userId){
    const [admins]=await database().execute<RowDataPacket[]>("SELECT pa.role FROM platform_admins pa JOIN users u ON u.id=pa.user_id WHERE pa.user_id=? AND pa.enabled=TRUE AND u.status='active'",[userId]);
    if(canAccessAllTenants(String(admins[0]?.role??""),admin===userId)){
      const [tenants]=await database().execute<RowDataPacket[]>("SELECT id FROM tenants WHERE id=?",[id]);
      if(!tenants.length)throw Error("TENANT_NOT_FOUND");
      return {tenantId:id,role:"owner" as TenantRole,adminAccess:true};
    }
  }
  const [rows]=await database().execute<RowDataPacket[]>(
    "SELECT m.role FROM memberships m INNER JOIN users u ON u.id=m.user_id INNER JOIN tenants t ON t.id=m.tenant_id WHERE m.tenant_id=? AND m.user_id=? AND m.status='active' AND u.status='active' AND t.status='active' LIMIT 1",
    [id,userId]
  );
  const role=rows[0]?.role as TenantRole|undefined;
  if(!role || !allowed.includes(role)) throw new Error("FORBIDDEN");
  return {tenantId:id,role};
}

export async function requirePlatformRole(userId:string, allowed:readonly PlatformRole[]){
  const [rows]=await database().execute<RowDataPacket[]>(
    "SELECT pa.role FROM platform_admins pa INNER JOIN users u ON u.id=pa.user_id WHERE pa.user_id=? AND pa.enabled=TRUE AND u.status='active' LIMIT 1",[userId]
  );
  const role=rows[0]?.role as PlatformRole|undefined;
  if(!role || !allowed.includes(role)) throw new Error("FORBIDDEN");
  return {role};
}
