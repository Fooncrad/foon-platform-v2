import type {RowDataPacket} from "mysql2/promise";
import {cookies} from "next/headers";
import {database} from "@/lib/db/mysql";
import {requireTenantMembership} from "@/lib/auth/authorization";
export const ACTIVE_TENANT_COOKIE="foon_active_tenant";
type Workspace={tenant_id:string;name:string;role:string;adminAccess:boolean;supportReadOnly:boolean};
export async function resolveWorkspace(userId:string,requested?:string):Promise<Workspace>{
 if(requested){
  // Never trust a URL parameter or active cookie as authorization.
  const access=await requireTenantMembership(userId,requested,["owner","manager","cashier","waiter","kitchen","driver","accountant"],false);
  const [rows]=await database().execute<RowDataPacket[]>("SELECT id AS tenant_id,name FROM tenants WHERE id=? AND status='active'",[access.tenantId]);
  if(!rows.length)throw Error("TENANT_NOT_FOUND");
  return {tenant_id:String(rows[0].tenant_id),name:String(rows[0].name),role:access.role,adminAccess:access.adminAccess,supportReadOnly:access.adminAccess&&access.platformRole==="support"};
 }
 // Cookie controls only the preferred account; membership is checked again.
 const preferred=(await cookies()).get(ACTIVE_TENANT_COOKIE)?.value;
 if(preferred){try{return await resolveWorkspace(userId,preferred);}catch{/* revoked membership or expired admin support */}}
 const [rows]=await database().execute<RowDataPacket[]>("SELECT m.tenant_id,m.role,t.name FROM memberships m JOIN tenants t ON t.id=m.tenant_id JOIN users u ON u.id=m.user_id WHERE m.user_id=? AND m.status='active' AND t.status='active' AND u.status='active' ORDER BY m.created_at LIMIT 1",[userId]);
 if(!rows.length)throw Error("FORBIDDEN");
 return {tenant_id:String(rows[0].tenant_id),name:String(rows[0].name),role:String(rows[0].role),adminAccess:false,supportReadOnly:false};
}
