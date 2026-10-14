import Link from "next/link";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import {resolveWorkspace} from "@/lib/tenant/workspace";
import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";
import {MEDIA_STUDIO_SECTIONS,MEDIA_STUDIO_LABELS,MEDIA_STUDIO_PROVIDERS,type MediaStudioLocale} from "@/lib/platform/media-studio";

/** Tenant-scoped Media Studio preview. No OAuth, publishing or messaging is enabled. */
export default async function MediaStudioPage({searchParams}:{searchParams:Promise<{tenant?:string}>}){
 const userId=await currentUserId();
 if(!userId)redirect("/login");
 const {tenant}=await searchParams;
 let workspace:Awaited<ReturnType<typeof resolveWorkspace>>;
 try{workspace=await resolveWorkspace(userId,tenant)}catch{redirect("/account")}
 if(!["owner","manager"].includes(workspace.role))redirect("/restaurant");
 const [accounts]=await database().execute<RowDataPacket[]>("SELECT provider,display_name,status FROM tenant_media_social_accounts WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100",[workspace.tenant_id]);
 const language=(await cookies()).get("foon_language")?.value;
 const locale:MediaStudioLocale=language==="en"||language==="fr"?language:"ar";
 const t=(ar:string,en:string,fr:string)=>locale==="en"?en:locale==="fr"?fr:ar;
 return <main dir={locale==="ar"?"rtl":"ltr"} style={{maxWidth:1100,margin:"0 auto",padding:"24px 16px"}}>
  <nav><Link href={"/restaurant?tenant="+encodeURIComponent(workspace.tenant_id)}>{t("العودة إلى لوحة النشاط","Back to workspace","Retour au tableau de bord")}</Link></nav>
  <h1>{t("إدارة الميديا","Media Studio","Studio média")}</h1>
  <p>{workspace.name} · {t("التسويق والحملات","Marketing and campaigns","Marketing et campagnes")}</p>
  <p role="status" style={{padding:12,border:"1px solid #9a8550",borderRadius:8}}>
   {t("نسخة تأسيسية: الربط والنشر والرسائل غير مفعّلة بعد. لا تدخل كلمات مرور حسابات التواصل هنا.",
      "Setup preview: account connection, publishing and messaging are not enabled. Do not enter social account passwords here.",
      "Aperçu initial : connexion, publication et messagerie non activées. Ne saisissez pas vos mots de passe sociaux ici.")}
  </p>
  <section><h2>{t("الحسابات المرتبطة","Connected accounts","Comptes connectés")}</h2>
   {accounts.length===0?<p>{t("لم يتم ربط أي حساب بعد","No accounts connected yet","Aucun compte connecté")}</p>:<ul>{accounts.map((account,index)=><li key={index}>{String(account.provider)} · {String(account.display_name)} · {String(account.status)}</li>)}</ul>}
  </section>
  <section aria-label={t("أقسام إدارة الميديا","Media Studio sections","Sections du studio média")} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,230px),1fr))",gap:12}}>
   {MEDIA_STUDIO_SECTIONS.map(section=><article key={section} style={{padding:16,border:"1px solid #8885",borderRadius:12}}>
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
 </main>;
}
