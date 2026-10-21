import Link from "next/link";
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
 return <main className="creatorPublic">
  <nav><Link href="/">FOON</Link><Link href="/market">استكشاف المتاجر</Link></nav>
  <section className="creatorPublicHeader">
   <div className="creatorPublicCover">{Number(profile.has_cover)===1&&<img src={"/api/creators/"+encodeURIComponent(handle)+"/avatar?type=cover"} alt={"غلاف ملف "+String(profile.display_name)} width={1000} height={230}/>}</div>
   {/* A failed image request must not reveal whether a private avatar exists. */}
   {Number(profile.has_avatar)===1&&<img src={"/api/creators/"+encodeURIComponent(handle)+"/avatar"} alt="الصورة الشخصية لصانع المحتوى" width={112} height={112}/>}
   <div><small>ملف صانع المحتوى</small><h1>{String(profile.display_name)}</h1><p>{String(profile.bio??"")}</p></div>
  </section>
  {socialLinks.length>0&&<section className="creatorPublicSocial"><h2>تابع صانع المحتوى</h2>
   <div className="creatorSocialGrid">{socialLinks.map(link=><a key={link.platform} href={link.url} target="_blank" rel="noopener noreferrer nofollow external" className={"creatorSocialLink creatorSocialLink--"+link.platform} aria-label={link.platform}>
    <CreatorSocialIcon platform={link.platform}/><span>{link.platform==="x"?"X":link.platform==="website"?"الموقع الشخصي":link.platform.charAt(0).toUpperCase()+link.platform.slice(1)}</span>
   </a>)}</div>
  </section>}
  <section className="creatorPublicQr" aria-label="رمز QR لزيارة الملف">
   <div><h2>امسح QR لفتح الملف الشخصي</h2><p>وجّه كاميرا الجوال إلى الرمز لفتح هذا الملف العام مباشرة.</p>
    <a href={"/api/creators/"+encodeURIComponent(handle)+"/qr"} download={"foon-"+handle+"-qr.svg"}>حفظ رمز QR</a>
   </div>
   <img src={"/api/creators/"+encodeURIComponent(handle)+"/qr"} alt={"QR لملف "+String(profile.display_name)} width={200} height={200}/>
  </section>
  <section className="creatorPublicSocial"><h2>أنشئ متجرك أو مطعمك عبر هذا المبدع</h2><p>سجل نشاطًا جديدًا ثم اختر باقة مدفوعة بعد التسجيل. لا تُحتسب أي عمولة إلا بعد تأكيد المنصة للدفع.</p><Link href={"/register?ref="+encodeURIComponent(handle)}>إنشاء متجر أو مطعم برابط صانع المحتوى</Link></section>
  <section><h2>معرض الأعمال المنشورة</h2>
   {images.length?<div className="creatorPublicGallery">{images.map(item=><figure key={String(item.id)}>
    <img src={"/api/creators/"+encodeURIComponent(handle)+"/media/"+encodeURIComponent(String(item.id))} alt={String(item.caption||"عمل منشور")} loading="lazy" width={320} height={320}/>
    {item.caption&&<figcaption>{String(item.caption)}</figcaption>}
   </figure>)}</div>:<p>لم ينشر صانع المحتوى أعمالًا بعد.</p>}
  </section>
 </main>;
}
