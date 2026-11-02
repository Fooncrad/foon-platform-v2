import {readLandingSettings} from "@/lib/platform/landing-content";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import PublicLanding from "./public-landing";
import {publicFooterPages} from "@/lib/platform/public-footer-pages";
export default async function Home(){
 let pages:{slug:string;title:string}[]=[];
 let plans:{code:string;nameAr:string;nameEn:string;nameFr:string;features:string[];prices:{cycle:string;currency:string;price:number}[]}[]=[];
 pages=await publicFooterPages();
 try{const [rows]=await database().execute<RowDataPacket[]>("SELECT p.code,p.name_ar,p.name_en,p.name_fr,pr.billing_cycle,pr.currency,pr.price FROM package_plans p LEFT JOIN package_plan_prices pr ON pr.plan_id=p.id AND pr.enabled=TRUE WHERE p.enabled=TRUE ORDER BY p.sort_order,p.code,pr.price LIMIT 100");const map=new Map<string,(typeof plans)[number]>();for(const row of rows){const code=String(row.code);if(!map.has(code))map.set(code,{code,nameAr:String(row.name_ar),nameEn:String(row.name_en||row.name_ar),nameFr:String(row.name_fr||row.name_ar),prices:[],features:[]});if(row.billing_cycle!=null)map.get(code)!.prices.push({cycle:String(row.billing_cycle),currency:String(row.currency),price:Number(row.price)});}plans=[...map.values()];try{const [features]=await database().execute<RowDataPacket[]>("SELECT p.code,pf.feature_key FROM package_plans p JOIN package_plan_features pf ON pf.plan_id=p.id WHERE p.enabled=TRUE ORDER BY pf.feature_key LIMIT 800");for(const feature of features){const plan=map.get(String(feature.code));if(plan&&plan.features.length<8)plan.features.push(String(feature.feature_key));}}catch{/* Feature catalog not available: never invent features */}}catch{/* Plans unavailable: hide pricing instead of inventing it */}
 const landingSettings=await readLandingSettings();
 return <PublicLanding pages={pages} plans={plans} landingSettings={landingSettings}/>;
}
