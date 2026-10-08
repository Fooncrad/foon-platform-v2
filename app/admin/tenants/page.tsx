import Link from "next/link";
import {redirect} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import TenantManager from "@/app/admin/tenants/tenant-manager";

export default async function TenantsPage({searchParams}:{searchParams:Promise<{q?:string;status?:string}>}){
 const params=await searchParams;const q=String(params.q??"").trim().slice(0,100);
 const status=["pending","active","suspended"].includes(params.status??"")?params.status!:"";
 const where:string[]=[];const values:string[]=[];
 if(q){where.push("(t.name LIKE ? OR t.slug LIKE ?)");values.push("%"+q+"%","%"+q+"%");}
 if(status){where.push("t.status=?");values.push(status);}
 const filter=where.length?" WHERE "+where.join(" AND "):"";
 const id=await currentActiveAdminUserId();if(!id)redirect("/login");
 let role:"super_admin"|"admin"|"support";
 try{({role}=await requirePlatformRole(id,["super_admin","admin","support"]))}catch{redirect("/account")}
 const [rows]=await database().execute<RowDataPacket[]>("SELECT t.id,t.name,t.slug,t.kind,t.status,t.created_at,p.name_ar AS plan_name,s.status AS subscription_status FROM tenants t LEFT JOIN tenant_subscriptions s ON s.tenant_id=t.id LEFT JOIN package_plans p ON p.id=s.plan_id"+filter+" ORDER BY t.created_at DESC LIMIT 200",values);
 const data=JSON.parse(JSON.stringify(rows));
 const active=data.filter((x:{status:string})=>x.status==="active").length;
 const pending=data.filter((x:{status:string})=>x.status==="pending").length;
 return <main className="workspace"><header className="workspace-head"><div><h1>المتاجر</h1><p>إنشاء وإدارة المطاعم والمتاجر من داخل لوحة المنصة.</p></div></header>
 <section className="adminPanel"><form action="/admin/tenants" className="adminUserFilters"><label>بحث المتجر<input name="q" defaultValue={q} maxLength={100} placeholder="اسم المتجر أو الرابط"/></label><label>الحالة<select name="status" defaultValue={status}><option value="">الكل</option><option value="active">نشط</option><option value="pending">قيد المراجعة</option><option value="suspended">موقوف</option></select></label><button type="submit">بحث</button><Link href="/admin/tenants">إعادة تعيين</Link></form><p>النتائج المعروضة: {data.length} من أصل حد أقصى 200.</p></section>
 <section className="tenant-summary"><article><strong>{data.length}</strong><span>الإجمالي</span></article><article><strong>{active}</strong><span>نشطة</span></article><article><strong>{pending}</strong><span>قيد المراجعة</span></article></section>
 <TenantManager initial={data} canManage={role!=="support"} canAccessAll={role==="super_admin"}/></main>;
}
