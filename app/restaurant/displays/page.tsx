import {redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import {resolveWorkspace} from "@/lib/tenant/workspace";
import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";
import DisplayManager from "../display-manager";
import {tenantEntitlement} from "@/lib/plans/entitlements";
export const dynamic="force-dynamic";
export default async function DisplaysPage({searchParams}:{searchParams:Promise<{tenant?:string}>}){
 const user=await currentUserId();if(!user)redirect("/login");const {tenant}=await searchParams;
 let workspace;try{workspace=await resolveWorkspace(user,tenant);}catch{redirect("/account");}
 if(workspace.supportReadOnly||(!["owner","manager"].includes(workspace.role)&&!workspace.adminAccess))redirect("/account");
 if(!(await tenantEntitlement(workspace.tenant_id,"display_advertising")).enabled)redirect("/account");
 const [branches]=await database().execute<RowDataPacket[]>("SELECT id,name FROM branches WHERE tenant_id=? AND enabled=TRUE ORDER BY created_at",[workspace.tenant_id]);
 return <DisplayManager tenantId={workspace.tenant_id} branches={branches.map(b=>({id:String(b.id),name:String(b.name)}))} language="ar"/>;
}
