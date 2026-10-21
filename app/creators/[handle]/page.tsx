import Link from "next/link";
import {notFound} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {validCreatorHandle} from "@/lib/creator/profile-policy";
import "./creator-public.css";

export const dynamic="force-dynamic";
export default async function CreatorPublicPage({params}:{params:Promise<{handle:string}>}){
 const {handle}=await params;
 if(!validCreatorHandle(handle))notFound();
 const [profiles]=await database().execute<RowDataPacket[]>(
  "SELECT p.handle,p.display_name,p.bio,CASE WHEN up.avatar_image IS NULL THEN 0 ELSE 1 END AS has_avatar FROM customer_creator_profiles p "+
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
 return <main className="creatorPublic">
  <nav><Link href="/">FOON</Link><Link href="/market">استكشاف المتاجر</Link></nav>
  <section className="creatorPublicHeader">
   {/* A failed image request must not reveal whether a private avatar exists. */}
   {Number(profile.has_avatar)===1&&<img src={"/api/creators/"+encodeURIComponent(handle)+"/avatar"} alt="الصورة الشخصية لصانع المحتوى" width={112} height={112}/>}
   <div><small>ملف صانع المحتوى</small><h1>{String(profile.display_name)}</h1><p>{String(profile.bio??"")}</p></div>
  </section>
  <section><h2>معرض الأعمال المنشورة</h2>
   {images.length?<div className="creatorPublicGallery">{images.map(item=><figure key={String(item.id)}>
    <img src={"/api/creators/"+encodeURIComponent(handle)+"/media/"+encodeURIComponent(String(item.id))} alt={String(item.caption||"عمل منشور")} loading="lazy" width={320} height={320}/>
    {item.caption&&<figcaption>{String(item.caption)}</figcaption>}
   </figure>)}</div>:<p>لم ينشر صانع المحتوى أعمالًا بعد.</p>}
  </section>
 </main>;
}
