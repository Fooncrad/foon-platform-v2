import {redirect} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import TenantManager from "@/app/admin/tenants/tenant-manager";

export default async function TenantsPage(){
 const id=await currentActiveAdminUserId();if(!id)redirect("/login");
 try{await requirePlatformRole(id,["super_admin","admin","support"])}catch{redirect("/account")}
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id,name,slug,kind,status,created_at FROM tenants ORDER BY created_at DESC LIMIT 200");
 const data=JSON.parse(JSON.stringify(rows));
 const active=data.filter((x:{status:string})=>x.status==="active").length;
 const pending=data.filter((x:{status:string})=>x.status==="pending").length;
 return <main className="workspace"><header className="workspace-head"><div><h1>المتاجر</h1><p>إنشاء وإدارة المطاعم والمتاجر من داخل لوحة المنصة.</p></div></header>
 <section className="tenant-summary"><article><strong>{data.length}</strong><span>الإجمالي</span></article><article><strong>{active}</strong><span>نشطة</span></article><article><strong>{pending}</strong><span>قيد المراجعة</span></article></section>
 <TenantManager initial={data}/></main>;
}