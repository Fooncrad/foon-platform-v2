import CanonicalTenantUrl from "../canonical-tenant-url";
import Link from "next/link";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import {resolveWorkspace} from "@/lib/tenant/workspace";
import {tenantWorkspaceActivity} from "@/lib/tenant/workspace-activity";
import {activityWorkspaceUrl,activityMediaStudioUrl} from "@/lib/tenant/workspace-routes";
import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";
import {MEDIA_STUDIO_SECTIONS,MEDIA_STUDIO_LABELS,MEDIA_STUDIO_PROVIDERS,type MediaStudioLocale} from "@/lib/platform/media-studio";
import MediaStudioTheme from "./media-studio-theme";

/** Tenant-scoped Media Studio preview. No OAuth, publishing or messaging is enabled. */
export default async function MediaStudioPage({searchParams,params}:{searchParams:Promise<{tenant?:string}>;params?:Promise<{activity?:string}>}){
 const userId=await currentUserId();
 if(!userId)redirect("/login");
 const {tenant}=await searchParams;
 let workspace:Awaited<ReturnType<typeof resolveWorkspace>>;
 try{workspace=await resolveWorkspace(userId,tenant)}catch{redirect("/account")}
 const activity=await tenantWorkspaceActivity(workspace.tenant_id);
 if(!activity)redirect("/business?tenant="+encodeURIComponent(workspace.tenant_id));
 if(activity!==((await params)?.activity??"restaurant"))redirect(activityMediaStudioUrl(activity,workspace.tenant_id));
 if(!["owner","manager"].includes(workspace.role))redirect(activityWorkspaceUrl(activity,workspace.tenant_id));
 const [accounts]=await database().execute<RowDataPacket[]>("SELECT provider,display_name,status FROM tenant_media_social_accounts WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100",[workspace.tenant_id]);
 const language=(await cookies()).get("foon_language")?.value;
 const locale:MediaStudioLocale=language==="en"||language==="fr"?language:"ar";
 const t=(ar:string,en:string,fr:string)=>locale==="en"?en:locale==="fr"?fr:ar;
 return <MediaStudioTheme><main dir={locale==="ar"?"rtl":"ltr"}><CanonicalTenantUrl tenantId={workspace.tenant_id}/>
  <nav><Link href={activityWorkspaceUrl(activity)}>{t("العودة إلى لوحة النشاط","Back to workspace","Retour au tableau de bord")}</Link></nav>
  <h1>{t("إدارة الميديا","Media Studio","Studio média")}</h1>
  <p>{workspace.name} · {t("التسويق والحملات","Marketing and campaigns","Marketing et campagnes")}</p>
  <p role="status">
   {t("نسخة تأسيسية: الربط والنشر والرسائل غير مفعّلة بعد. لا تدخل كلمات مرور حسابات التواصل هنا.",
      "Setup preview: account connection, publishing and messaging are not enabled. Do not enter social account passwords here.",
      "Aperçu initial : connexion, publication et messagerie non activées. Ne saisissez pas vos mots de passe sociaux ici.")}
  </p>
  <section><h2>{t("الحسابات المرتبطة","Connected accounts","Comptes connectés")}</h2>
   {accounts.length===0?<p>{t("لم يتم ربط أي حساب بعد","No accounts connected yet","Aucun compte connecté")}</p>:<ul>{accounts.map((account,index)=><li key={index}>{String(account.provider)} · {String(account.display_name)} · {String(account.status)}</li>)}</ul>}
  </section>
  <section aria-label={t("أقسام إدارة الميديا","Media Studio sections","Sections du studio média")}>
   {MEDIA_STUDIO_SECTIONS.map(section=><article key={section}>
    <h2 style={{fontSize:"1.1rem"}}>{MEDIA_STUDIO_LABELS[section][locale]}</h2>
    <p>{t("قيد التجهيز","Coming soon","En préparation")}</p>
   </article>)}
  </section>
  <section><h2>{t("المنصات المستهدفة","Planned platforms","Plateformes prévues")}</h2>
   <p>{MEDIA_STUDIO_PROVIDERS.join(" · ")}</p>
   <p>{t("الإتاحة الفعلية لكل وظيفة تعتمد على موافقات المنصات وصلاحيات OAuth.",
      "Actual features depend on provider approval and OAuth scopes.",
      "Les fonctions dépendent des autorisations des plateformes et des portées OAuth.")}</p>
  </section>
 </main></MediaStudioTheme>;
}
