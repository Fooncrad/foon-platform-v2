import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";
import type {PublicPageLink} from "@/lib/ux/public-site-links";
export async function publicFooterPages():Promise<PublicPageLink[]>{
 try{
  const [rows]=await database().execute<RowDataPacket[]>("SELECT slug,title_ar,title_en,title_fr FROM platform_content_pages WHERE status='published' ORDER BY updated_at DESC LIMIT 12");
  return rows.map(row=>({slug:String(row.slug),title:String(row.title_ar??""),titleEn:typeof row.title_en==="string"?row.title_en:"",titleFr:typeof row.title_fr==="string"?row.title_fr:""}));
 }catch{return [];} // Optional CMS migration or unavailable DB must not break public pages.
}
