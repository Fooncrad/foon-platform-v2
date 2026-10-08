import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {requireTenantMembership} from "@/lib/auth/authorization";
type Workspace={tenant_id:string;name:string;role:string;adminAccess:boolean};
export async function resolveWorkspace(userId:string,requested?:string):Promise<Workspace>{
 if(requested){const access=await requireTenantMembership(userId,requested,["owner","manager","cashier","waiter","kitchen","driver","accountant"]);
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id AS tenant_id,name FROM tenants WHERE id=?",[access.tenantId]);
 if(!rows.length)throw Error("TENANT_NOT_FOUND");return {tenant_id:String(rows[0].tenant_id),name:String(rows[0].name),role:access.role,adminAccess:"adminAccess" in access};}
 const [rows]=await database().execute<RowDataPacket[]>("SELECT m.tenant_id,m.role,t.name FROM memberships m JOIN tenants t ON t.id=m.tenant_id JOIN users u ON u.id=m.user_id WHERE m.user_id=? AND m.status='active' AND t.status='active' AND u.status='active' ORDER BY m.created_at LIMIT 1",[userId]);
 if(!rows.length)throw Error("FORBIDDEN");return {tenant_id:String(rows[0].tenant_id),name:String(rows[0].name),role:String(rows[0].role),adminAccess:false};
}
