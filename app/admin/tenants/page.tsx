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
 const [rows]=await database().execute<RowDataPacket[]>("SELECT t.id,t.name,t.slug,t.kind,t.status,t.market_enabled,t.market_visible_from,t.market_visible_until,t.market_sort_order,t.created_at,p.name_ar AS plan_name,s.status AS subscription_status FROM tenants t LEFT JOIN tenant_subscriptions s ON s.tenant_id=t.id LEFT JOIN package_plans p ON p.id=s.plan_id"+filter+" ORDER BY t.created_at DESC LIMIT 200",values);
 const data=JSON.parse(JSON.stringify(rows));
 const active=data.filter((x:{status:string})=>x.status==="active").length;
 const pending=data.filter((x:{status:string})=>x.status==="pending").length;
 return <main className="workspace" dir={language==="ar"?"rtl":"ltr"}><header className="workspace-head"><div><h1>{tr("المتاجر","Stores","Boutiques")}</h1><p>{tr("إنشاء وإدارة المطاعم والمتاجر من داخل لوحة المنصة.","Create and manage restaurants and stores from the platform dashboard.","Créez et gérez les restaurants et boutiques depuis le tableau de bord.")}</p></div></header>
 <section className="adminPanel"><form action="/admin/tenants" className="adminUserFilters"><label>{tr("بحث المتجر","Search stores","Rechercher des boutiques")}<input name="q" defaultValue={q} maxLength={100} placeholder={tr("اسم المتجر أو الرابط","Store name or URL","Nom ou adresse de la boutique")}/></label><label>{tr("الحالة","Status","Statut")}<select name="status" defaultValue={status}><option value="">{tr("الكل","All","Tous")}</option><option value="active">{tr("نشط","Active","Actif")}</option><option value="pending">{tr("قيد المراجعة","Pending review","En attente de validation")}</option><option value="suspended">{tr("موقوف","Suspended","Suspendu")}</option></select></label><button type="submit">{tr("بحث","Search","Rechercher")}</button><Link href="/admin/tenants">{tr("إعادة تعيين","Reset","Réinitialiser")}</Link></form><p>{tr("النتائج المعروضة: ","Results shown: ","Résultats affichés : ")}{data.length}{tr(" من أصل حد أقصى 200."," of up to 200."," sur un maximum de 200.")}</p><p>{tr("دخول المسؤول للمتجر كامل ومؤقت ومسجل. إعداد الطباعة الآلية مستقل؛ لا تطبع الأقسام حتى تفعيل طابعاتها وتوجيهها.","Administrator entry is full, temporary and audited. Automatic printing is separate; departments print only when their printers and routing are enabled.","L’accès administrateur est complet, temporaire et consigné. L’impression automatique est séparée ; les sections n’impriment qu’après activation et routage de leurs imprimantes.")}</p></section>
 <section className="tenant-summary"><article><strong>{data.length}</strong><span>{tr("الإجمالي","Total","Total")}</span></article><article><strong>{active}</strong><span>{tr("نشطة","Active","Actives")}</span></article><article><strong>{pending}</strong><span>{tr("قيد المراجعة","Pending review","En attente de validation")}</span></article></section>
 <TenantManager initial={data} canManage={role!=="support"} canSupport={true}/></main>;
}
