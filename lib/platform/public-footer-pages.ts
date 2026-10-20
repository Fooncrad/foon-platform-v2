import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";
import type {PublicPageLink} from "@/lib/ux/public-site-links";
export async function publicFooterPages():Promise<PublicPageLink[]>{
 try{
  const [rows]=await database().execute<RowDataPacket[]>("SELECT slug,title_ar FROM platform_content_pages WHERE status='published' ORDER BY updated_at DESC LIMIT 12");
  return rows.map(row=>({slug:String(row.slug),title:String(row.title_ar)}));
 }catch{return [];} // Optional CMS migration or unavailable DB must not break public pages.
}
