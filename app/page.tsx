import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import PublicLanding from "./public-landing";
export default async function Home(){
 let pages:{slug:string;title:string}[]=[];
 try{const [rows]=await database().execute<RowDataPacket[]>("SELECT slug,title_ar FROM platform_content_pages WHERE status='published' ORDER BY updated_at DESC LIMIT 12");pages=rows.map(row=>({slug:String(row.slug),title:String(row.title_ar)}));}catch{/* CMS migration may not be installed yet */}
 return <PublicLanding pages={pages}/>;
}
