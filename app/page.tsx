import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import PublicLanding from "./public-landing";
export default async function Home(){
 let pages:{slug:string;title:string}[]=[];
 let plans:{code:string;nameAr:string;nameEn:string;prices:{cycle:string;currency:string;price:number}[]}[]=[];
 try{const [rows]=await database().execute<RowDataPacket[]>("SELECT slug,title_ar FROM platform_content_pages WHERE status='published' ORDER BY updated_at DESC LIMIT 12");pages=rows.map(row=>({slug:String(row.slug),title:String(row.title_ar)}));}catch{/* CMS migration may not be installed yet */}
 try{const [rows]=await database().execute<RowDataPacket[]>("SELECT p.code,p.name_ar,p.name_en,pr.billing_cycle,pr.currency,pr.price FROM package_plans p LEFT JOIN package_plan_prices pr ON pr.plan_id=p.id AND pr.enabled=TRUE WHERE p.enabled=TRUE ORDER BY p.sort_order,p.code,pr.price LIMIT 100");const map=new Map<string,(typeof plans)[number]>();for(const row of rows){const code=String(row.code);if(!map.has(code))map.set(code,{code,nameAr:String(row.name_ar),nameEn:String(row.name_en||row.name_ar),prices:[]});if(row.billing_cycle!=null)map.get(code)!.prices.push({cycle:String(row.billing_cycle),currency:String(row.currency),price:Number(row.price)});}plans=[...map.values()];}catch{/* Plans unavailable: hide pricing instead of inventing it */}
 return <PublicLanding pages={pages} plans={plans}/>;
}
