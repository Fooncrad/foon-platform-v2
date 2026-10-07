import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import { currentUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";
import { database } from "@/lib/db/mysql";
import TenantManager from "./tenant-manager";

export default async function TenantsPage(){
 const id=await currentUserId();if(!id)redirect("/login");try{await requirePlatformRole(id,["super_admin","admin","support"]);}catch{redirect("/account");}
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id,name,slug,kind,status,created_at FROM tenants ORDER BY created_at DESC LIMIT 200");
 return <main className="workspace"><header className="workspace-head"><div><span className="auth-brand">FOON</span><h1>إدارة المتاجر</h1><p>إنشاء ومراجعة حسابات المطاعم والمتاجر.</p></div></header><TenantManager initial={JSON.parse(JSON.stringify(rows))}/></main>;
}
