import Link from "next/link";
import {cookies} from "next/headers";
import ActivityTools from "../activity-tools";
import AccountLanguageSwitcher from "../account-language-switcher";
import {redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import {resolveWorkspace} from "@/lib/tenant/workspace";
import {database} from "@/lib/db/mysql";
import {isActivityType} from "@/lib/platform/activity-presets";
import type {RowDataPacket} from "mysql2/promise";
import ActivityCatalogEditor from "../activity-catalog-editor";
import ActivityTemplateEditor from "../activity-template-editor";

/** Activity setup is tenant-scoped and available only to store owners/managers. */
export default async function ActivitySetupPage({searchParams}:{searchParams:Promise<{tenant?:string}>}){
 const userId=await currentUserId();
 if(!userId)redirect("/login");
 const {tenant}=await searchParams;
 let workspace:Awaited<ReturnType<typeof resolveWorkspace>>;
 try{workspace=await resolveWorkspace(userId,tenant)}catch{redirect("/account")}
 if(!["owner","manager"].includes(workspace.role))redirect("/restaurant");
 const [profiles]=await database().execute<RowDataPacket[]>(
  "SELECT activity_code FROM tenant_business_profiles WHERE tenant_id=? LIMIT 1",
  [workspace.tenant_id]
 );
 const stored=String(profiles[0]?.activity_code??"");
 const activity=isActivityType(stored)?stored:null;
 const lang=(await cookies()).get("foon_language")?.value;
 const t=(ar:string,en:string,fr:string)=>lang==="en"?en:lang==="fr"?fr:ar;
 if(!activity)return <main style={{maxWidth:900,margin:"0 auto",padding:24}} role="alert"><Link href={"/restaurant?tenant="+encodeURIComponent(workspace.tenant_id)}>← {t("العودة إلى لوحة النشاط","Back to workspace","Retour au tableau de bord")}</Link><p>{t("تعذر تحديد نوع النشاط المسجل. راجع إعدادات النشاط قبل تعديل المنتجات أو الخدمات.","The registered activity type is missing or unsupported. Review business settings before editing products or services.","Le type d’activité enregistré est absent ou non pris en charge. Vérifiez les paramètres avant de modifier les produits ou services.")}</p></main>;
 const service=["carwash","laundry","automotive","salon","publicworks"].includes(activity);
 const [tenants]=await database().execute<RowDataPacket[]>("SELECT slug FROM tenants WHERE id=? LIMIT 1",[workspace.tenant_id]);
 const slug=String(tenants[0]?.slug??"");
 return <main dir={lang==="en"||lang==="fr"?"ltr":"rtl"} style={{maxWidth:1100,margin:"0 auto",padding:"24px 16px"}}>
  <AccountLanguageSwitcher/><Link href={"/restaurant?tenant="+encodeURIComponent(workspace.tenant_id)}>{t("العودة إلى لوحة النشاط","Back to business workspace","Retour au tableau de bord")}</Link>
  <h1>{t("إعداد النشاط","Business setup","Configuration de l’activité")} · {workspace.name}</h1>
  <ActivityTools tenantId={workspace.tenant_id} activity={activity} language={lang==="en"||lang==="fr"?lang:"ar"}/>
  <section id="catalog"><h2>{service?t("الخدمات والأقسام","Services and categories","Services et catégories"):t("المنتجات والأقسام","Products and categories","Produits et catégories")}</h2>
   {activity==="restaurant"?<Link href={"/restaurant/menu?tenant="+encodeURIComponent(workspace.tenant_id)}>{t("فتح إدارة المنيو","Open menu management","Ouvrir la gestion du menu")}</Link>:<ActivityCatalogEditor tenantId={workspace.tenant_id} service={service}/>}
  </section>
  <ActivityTemplateEditor tenantId={workspace.tenant_id} activity={activity} slug={slug}/>
 </main>;
}
