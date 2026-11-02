import Link from "next/link";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import "./[handle]/creator-public.css";
export const dynamic="force-dynamic";
export default async function CreatorsDirectory({searchParams}:{searchParams:Promise<{q?:string}>}){
 const q=(await searchParams).q?.trim().slice(0,60)??"";
 const filters=q?" AND (p.display_name LIKE ? OR p.handle LIKE ?)":"";
 const params=q?["%"+q.replace(/[%_]/g,"") +"%","%"+q.replace(/[%_]/g,"")+"%"]:[];
 const [profiles]=await database().execute<RowDataPacket[]>(
  "SELECT p.handle,p.display_name,p.bio FROM customer_creator_profiles p "+
  "JOIN users u ON u.id=p.user_id AND u.status='active' "+
  "WHERE p.visibility='public' "+
  "AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=p.user_id) "+
  "AND NOT EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id=p.user_id)"+
  filters+" ORDER BY p.created_at DESC LIMIT 60",params);
 return <main className="creatorPublic"><nav><Link href="/">FOON</Link><Link href="/market">السوق</Link></nav>
  <h1>صنّاع المحتوى</h1><p>تظهر هنا الملفات التي اختار أصحابها جعلها عامة فقط.</p>
  <form method="get" action="/creators"><label>البحث عن صانع محتوى <input name="q" maxLength={60} defaultValue={q} placeholder="الاسم أو المعرّف"/></label><button type="submit">بحث</button></form>
  <div className="creatorPublicGallery">{profiles.map(p=><article key={String(p.handle)} style={{padding:18,border:"1px solid #ffffff20",borderRadius:14,background:"#24221e",minWidth:0}}>
   <Link href={"/creators/"+encodeURIComponent(String(p.handle))}><strong>{String(p.display_name)}</strong></Link>
   <p style={{overflowWrap:"anywhere"}} dir="ltr">@{String(p.handle)}</p>
   <p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{String(p.bio??"").slice(0,180)}</p>
  </article>)}</div>
  {!profiles.length&&<p>لا توجد ملفات عامة مطابقة حاليًا.</p>}
 </main>;
}
