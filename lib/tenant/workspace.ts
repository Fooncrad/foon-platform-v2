import type {RowDataPacket} from "mysql2/promise";
import {cookies} from "next/headers";
import {database} from "@/lib/db/mysql";
import {requireTenantMembership} from "@/lib/auth/authorization";
export const ACTIVE_TENANT_COOKIE="foon_active_tenant";
export type Workspace={tenant_id:string;name:string;role:string;adminAccess:boolean;supportReadOnly:boolean};
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

/**
 * Resolve a URL's activity independently from the last activity opened.
 * The preference cookie is never authorization. A valid active membership or
 * an already approved, scoped support session is mandatory for every tenant.
 */
export async function resolveWorkspaceForActivity(userId:string,activity:string,requested?:string):Promise<Workspace>{
 const {isActivityType}=await import("@/lib/platform/activity-presets");
 const {tenantWorkspaceActivity}=await import("@/lib/tenant/workspace-activity");
 if(!isActivityType(activity))throw Error("UNKNOWN_ACTIVITY");
 // A legacy, explicit tenant link is still verified, then the page's existing
 // mismatch guard redirects to that tenant's actual activity when needed.
 if(requested)return resolveWorkspace(userId,requested);
 const preferred=(await cookies()).get(ACTIVE_TENANT_COOKIE)?.value;
 if(preferred){
  try{
   const account=await resolveWorkspace(userId,preferred);
   if(await tenantWorkspaceActivity(account.tenant_id)===activity)return account;
  }catch{/* cookie is stale, revoked or no longer authorized */}
 }
 const [memberships]=await database().execute<RowDataPacket[]>(
  "SELECT m.tenant_id FROM memberships m JOIN tenants t ON t.id=m.tenant_id AND t.status='active' JOIN users u ON u.id=m.user_id AND u.status='active' WHERE m.user_id=? AND m.status='active' ORDER BY m.created_at",
  [userId]
 );
 for(const row of memberships){
  const id=String(row.tenant_id);
  if(await tenantWorkspaceActivity(id)===activity)return resolveWorkspace(userId,id);
 }
 throw Error("ACTIVITY_MEMBERSHIP_NOT_FOUND");
}
