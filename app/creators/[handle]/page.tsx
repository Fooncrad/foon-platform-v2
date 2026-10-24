import Link from "next/link";
import {cookies as uiCookies} from "next/headers";
import CreatorPublicShare from "./creator-public-share";
import type {Metadata} from "next";
import {notFound} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {validCreatorHandle} from "@/lib/creator/profile-policy";
import {normalizeCreatorSocialLink} from "@/lib/creator/social-links";
import CreatorSocialIcon from "@/app/components/creator-social-icon";
import "./creator-public.css";

export const dynamic="force-dynamic";
type CreatorParams={params:Promise<{handle:string}>};
export async function generateMetadata({params}:CreatorParams):Promise<Metadata>{
 const {handle}=await params;
 if(!validCreatorHandle(handle))return {title:"FOON",robots:{index:false,follow:false}};
 const [rows]=await database().execute<RowDataPacket[]>(
  "SELECT p.display_name,p.bio FROM customer_creator_profiles p "+
  "JOIN users u ON u.id=p.user_id AND u.status='active' "+
  "WHERE p.handle=? AND p.visibility='public' "+
  "AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=p.user_id) "+
  "AND NOT EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id=p.user_id) LIMIT 1",[handle]);
 if(!rows.length)return {title:"FOON",robots:{index:false,follow:false}};
 const name=String(rows[0].display_name),desc=String(rows[0].bio??"").slice(0,160);
 return {title:name+" | FOON Creators",description:desc||"ملف صانع محتوى على FOON",
  robots:{index:true,follow:true},openGraph:{type:"profile",title:name+" | FOON",description:desc||"ملف صانع محتوى"}};
}
export default async function CreatorPublicPage({params}:CreatorParams){
 const {handle}=await params;
 if(!validCreatorHandle(handle))notFound();
 const uiLanguage=(await uiCookies()).get("foon_language")?.value;
 const language=uiLanguage==="en"||uiLanguage==="fr"?uiLanguage:"ar";
 const t=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 const [profiles]=await database().execute<RowDataPacket[]>(
  "SELECT p.handle,p.display_name,p.bio,CASE WHEN up.avatar_image IS NULL THEN 0 ELSE 1 END AS has_avatar,CASE WHEN up.cover_image IS NULL THEN 0 ELSE 1 END AS has_cover FROM customer_creator_profiles p "+
  "JOIN users u ON u.id=p.user_id AND u.status='active' "+
  "LEFT JOIN user_profiles up ON up.user_id=p.user_id "+
  "WHERE p.handle=? AND p.visibility='public' "+
  "AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=p.user_id) "+
  "AND NOT EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id=p.user_id) LIMIT 1",[handle]);
 const profile=profiles[0];
 if(!profile)notFound();
 const [images]=await database().execute<RowDataPacket[]>(
  "SELECT cp.id,cp.caption FROM customer_creator_portfolio cp "+
  "JOIN customer_creator_profiles p ON p.user_id=cp.user_id "+
  "JOIN user_media_library m ON m.id=cp.media_id AND m.user_id=cp.user_id "+
  "WHERE p.handle=? AND p.visibility='public' "+
  "ORDER BY cp.created_at DESC,cp.id DESC LIMIT 24",[handle]);
 const [socialRows]=await database().execute<RowDataPacket[]>(
  "SELECT sl.platform,sl.url FROM customer_creator_social_links sl "+
  "JOIN customer_creator_profiles p ON p.user_id=sl.user_id "+
  "WHERE p.handle=? AND p.visibility='public' ORDER BY sl.display_order,sl.platform LIMIT 12",[handle]);
 // Validate stored links again before placing them in a clickable public element.
 const socialLinks=socialRows.flatMap(row=>{
  const parsed=normalizeCreatorSocialLink(row.platform,row.url);
  return parsed?[parsed]:[];
 });
 return <main className="creatorPublic" dir={language==="ar"?"rtl":"ltr"} lang={language}>
  <nav aria-label={t("التنقل في البروفايل العام","Public profile navigation","Navigation du profil public")}><Link href="/">FOON</Link><Link href="/creators">{t("اكتشف المبدعين","Discover creators","Découvrir les créateurs")}</Link><Link href="/market">{t("استكشاف المتاجر","Explore stores","Explorer les boutiques")}</Link></nav>
  <section className="creatorPublicHeader">
   <div className="creatorPublicCover">{Number(profile.has_cover)===1&&<img src={"/api/creators/"+encodeURIComponent(handle)+"/avatar?type=cover"} alt={t("غلاف ملف ","Cover of ","Couverture de ")+String(profile.display_name)} width={1000} height={230}/>}</div>
   {/* A failed image request must not reveal whether a private avatar exists. */}
   {Number(profile.has_avatar)===1&&<img src={"/api/creators/"+encodeURIComponent(handle)+"/avatar"} alt={t("الصورة الشخصية لصانع المحتوى","Creator avatar","Photo du créateur")} width={112} height={112}/>}
   <div><small>{t("بروفايل صانع محتوى عام","Public creator profile","Profil de créateur public")}</small><h1>{String(profile.display_name)}</h1><p>{String(profile.bio??"")||t("لم تُضاف نبذة بعد.","No bio has been added yet.","Aucune présentation pour le moment.")}</p><CreatorPublicShare language={language} profileName={String(profile.display_name)}/></div>
  </section>
  {socialLinks.length>0&&<section className="creatorPublicSocial"><h2>{t("روابط صانع المحتوى","Creator social links","Liens du créateur")}</h2>
   <div className="creatorSocialGrid">{socialLinks.map(link=><a key={link.platform} href={link.url} target="_blank" rel="noopener noreferrer nofollow external" className={"creatorSocialLink creatorSocialLink--"+link.platform} aria-label={link.platform}>
    <CreatorSocialIcon platform={link.platform}/><span>{link.platform==="x"?"X":link.platform==="website"?t("الموقع الشخصي","Website","Site web"):link.platform.charAt(0).toUpperCase()+link.platform.slice(1)}</span>
   </a>)}</div>
  </section>}
  <section className="creatorPublicQr" aria-label={t("رمز QR لزيارة الملف","QR code for this profile","Code QR de ce profil")}>
   <div><h2>{t("شارك ملفك برمز QR","Share profile with QR","Partager avec un QR")}</h2><p>{t("يمكن للزوار فتح هذا البروفايل العام بمسح الرمز، دون الاطلاع على بيانات حسابك الخاصة.","Visitors can open this public profile using QR; private account details remain hidden.","Les visiteurs peuvent ouvrir ce profil public, sans accéder à vos données privées.")}</p>
    <a href={"/api/creators/"+encodeURIComponent(handle)+"/qr"} download={"foon-"+handle+"-qr.svg"}>{t("حفظ رمز QR","Save QR code","Télécharger le QR")}</a>
   </div>
   <img src={"/api/creators/"+encodeURIComponent(handle)+"/qr"} alt={t("رمز QR لملف ","QR code for ","Code QR de ")+String(profile.display_name)} width={200} height={200}/>
  </section>
  <section className="creatorPublicSocial"><h2>{t("ابدأ نشاطك من هنا","Start your business here","Lancez votre activité")}</h2><p>{t("يمكنك التسجيل وبدء نشاط جديد. أي عمولات إحالة لا تُعتمد إلا بعد تأكيد الدفع من المنصة.","Register a new business. Referral commissions only count after the platform confirms payment.","Créez une activité. Les commissions ne sont acquises qu’après validation du paiement.")}</p><Link href={"/register?ref="+encodeURIComponent(handle)}>{t("إنشاء متجر أو مطعم","Create a store or restaurant","Créer une boutique ou un restaurant")}</Link></section>
  <section><h2>{t("معرض الأعمال المنشورة","Published portfolio","Portfolio publié")}</h2><p className="creatorPublicSafeNote">{t("تظهر هنا فقط الصور التي اختار صاحب البروفايل نشرها.","Only images explicitly published by this creator appear here.","Seules les images publiées volontairement apparaissent ici.")}</p>
   {images.length?<div className="creatorPublicGallery">{images.map(item=><figure key={String(item.id)}>
    <img src={"/api/creators/"+encodeURIComponent(handle)+"/media/"+encodeURIComponent(String(item.id))} alt={String(item.caption||t("عمل منشور","Published work","Œuvre publiée"))} loading="lazy" width={320} height={320}/>
    {item.caption&&<figcaption>{String(item.caption)}</figcaption>}
   </figure>)}</div>:<p>{t("لم ينشر صانع المحتوى أعمالًا بعد.","No portfolio work published yet.","Aucune œuvre publiée pour le moment.")}</p>}
  </section>
 </main>;
}
