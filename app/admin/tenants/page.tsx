import Link from "next/link";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import TenantManager from "@/app/admin/tenants/tenant-manager";

export default async function TenantsPage({searchParams}:{searchParams:Promise<{q?:string;status?:string}>}){
 const stored=(await cookies()).get("foon_language")?.value;
 const language=stored==="en"||stored==="fr"?stored:"ar";
 const tr=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 const params=await searchParams;const q=String(params.q??"").trim().slice(0,100);
 const status=["pending","active","suspended"].includes(params.status??"")?params.status!:"";
 const where:string[]=[];const values:string[]=[];
 if(q){where.push("(t.name LIKE ? OR t.slug LIKE ?)");values.push("%"+q+"%","%"+q+"%");}
 if(status){where.push("t.status=?");values.push(status);}
 const filter=where.length?" WHERE "+where.join(" AND "):"";
 const id=await currentActiveAdminUserId();if(!id)redirect("/login");
 let role:"super_admin"|"admin"|"support";
 try{({role}=await requirePlatformRole(id,["super_admin","admin","support"]))}catch{redirect("/account")}
 const [rows]=await database().execute<RowDataPacket[]>("SELECT t.id,t.name,t.slug,t.kind,t.status,t.created_at,p.name_ar AS plan_name,s.status AS subscription_status,bp.activity_code,bp.country_code,bp.currency FROM tenants t LEFT JOIN tenant_subscriptions s ON s.tenant_id=t.id LEFT JOIN package_plans p ON p.id=s.plan_id LEFT JOIN tenant_business_profiles bp ON bp.tenant_id=t.id"+filter+" ORDER BY t.created_at DESC LIMIT 200",values);
 const data=JSON.parse(JSON.stringify(rows));
 const [totals]=await database().execute<RowDataPacket[]>("SELECT COUNT(*) AS total,COALESCE(SUM(t.status='active'),0) AS active,COALESCE(SUM(t.status='pending'),0) AS pending FROM tenants t"+filter,values);
 const total=Number(totals[0]?.total??0),active=Number(totals[0]?.active??0),pending=Number(totals[0]?.pending??0);
 return <main className="workspace" dir={language==="ar"?"rtl":"ltr"}><header className="workspace-head"><div><h1>{tr("المتاجر","Stores","Boutiques")}</h1><p>{tr("إنشاء وإدارة المطاعم والمتاجر من داخل لوحة المنصة.","Create and manage restaurants and stores from the platform dashboard.","Créez et gérez les restaurants et boutiques depuis le tableau de bord.")}</p></div></header>
 <section className="adminPanel"><form action="/admin/tenants" className="adminUserFilters"><label>{tr("بحث المتجر","Search stores","Rechercher des boutiques")}<input name="q" defaultValue={q} maxLength={100} placeholder={tr("اسم المتجر أو الرابط","Store name or URL","Nom ou adresse de la boutique")}/></label><label>{tr("الحالة","Status","Statut")}<select name="status" defaultValue={status}><option value="">{tr("الكل","All","Tous")}</option><option value="active">{tr("نشط","Active","Actif")}</option><option value="pending">{tr("قيد المراجعة","Pending review","En attente de validation")}</option><option value="suspended">{tr("موقوف","Suspended","Suspendu")}</option></select></label><button type="submit">{tr("بحث","Search","Rechercher")}</button><Link href="/admin/tenants">{tr("إعادة تعيين","Reset","Réinitialiser")}</Link></form><p>{tr("النتائج المعروضة: ","Results shown: ","Résultats affichés : ")}{data.length}{tr(" من أصل "," of "," sur ")}{total}{tr(" نتيجة مطابقة (تعرض أول 200)."," matching results (showing first 200)."," résultats correspondants (200 premiers affichés).")}</p></section>
 <section className="tenant-summary"><article><strong>{total}</strong><span>{tr("الإجمالي","Total","Total")}</span></article><article><strong>{active}</strong><span>{tr("نشطة","Active","Actives")}</span></article><article><strong>{pending}</strong><span>{tr("قيد المراجعة","Pending review","En attente de validation")}</span></article></section>
 <TenantManager initial={data} canManage={role!=="support"} canAccessAll={role==="super_admin"}/></main>;
}
