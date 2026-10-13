import {notFound} from "next/navigation";
import {cookies} from "next/headers";
import type {ActivityLanguage} from "@/lib/platform/activity-presets";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import PublicMenu from "./public-menu";
import ActivityStorefront from "./activity-storefront";
import {isTemplateForActivity} from "@/lib/platform/activity-templates";
import {currentUserId} from "@/lib/auth/session";
import {publicMenuData} from "@/lib/restaurant/public-menu";

import {validStoreSlug} from "@/scripts/store-slug.mjs";

export async function generateMetadata({params}:{params:Promise<{slug:string}>}){
 const {slug:raw}=await params;
 const slug=raw.toLowerCase();
 if(!validStoreSlug(slug))return {title:"النشاط غير موجود | FOON",robots:{index:false,follow:false}};
 try{
  const [rows]=await database().execute<RowDataPacket[]>("SELECT id,name,kind,status FROM tenants WHERE slug=? LIMIT 1",[slug]);
  const tenant=rows[0];
  if(!tenant||tenant.status!=="active")return {title:"النشاط غير موجود | FOON",robots:{index:false,follow:false}};
  const name=String(tenant.name);
  const [profiles]=await database().execute<RowDataPacket[]>("SELECT activity_code FROM tenant_business_profiles WHERE tenant_id=? LIMIT 1",[String(tenant.id)]);
  const activity=String(profiles[0]?.activity_code??"");
  const description=activity==="restaurant"||!activity&&tenant.kind==="restaurant"?"اكتشف مطعم ":"اكتشف نشاط ";
  return {title:name+" | FOON",description:description+name+" على منصة FOON.",alternates:{canonical:"/"+encodeURIComponent(slug)}};
 }catch{return {title:"FOON",robots:{index:false,follow:false}}}
}

export default async function PublicTenantPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{previewTemplate?:string;category?:string;page?:string;q?:string}>}){
 const {slug:raw}=await params;
 const slug=raw.toLowerCase();
 if(!validStoreSlug(slug))notFound();
 const [rows]=await database().execute<RowDataPacket[]>(
  "SELECT id,name,slug,kind,status FROM tenants WHERE slug=? LIMIT 1",[slug]
 );
 const tenant=rows[0];
 if(!tenant||tenant.status!=="active")notFound();
 const [profiles]=await database().execute<RowDataPacket[]>("SELECT activity_code FROM tenant_business_profiles WHERE tenant_id=? LIMIT 1",[String(tenant.id)]);
 const activity=String(profiles[0]?.activity_code??"");
 if(activity==="restaurant"||!activity&&String(tenant.kind)==="restaurant")return <PublicMenu {...await publicMenuData({id:String(tenant.id),name:String(tenant.name)},slug)}/>;
 const query=await searchParams;
 const category=typeof query.category==="string"?query.category.slice(0,36):"";
 const search=typeof query.q==="string"?query.q.trim().slice(0,100):"";
 const page=Math.max(1,Math.min(100000,Number.isSafeInteger(Number(query.page))?Number(query.page):1));
 const limit=24,offset=(page-1)*limit;
 const filters=["p.tenant_id=?","p.enabled=TRUE","c.enabled=TRUE"];
 const filterValues:(string|number)[]=[String(tenant.id)];
 if(category){filters.push("c.id=?");filterValues.push(category)}
 if(search){filters.push("(p.name_ar LIKE ? OR p.name_en LIKE ? OR p.name_fr LIKE ?)");filterValues.push(...Array(3).fill("%"+search.replace(/[\\%_]/g,"\\ const [[themes],[products]]=await Promise.all(")+"%"))}
 const where=filters.join(" AND ");
 const [[categories],[counts]]=await Promise.all([
  database().execute<RowDataPacket[]>("SELECT id,name_ar,name_en,name_fr FROM catalog_categories WHERE tenant_id=? AND enabled=TRUE ORDER BY sort_order,created_at",[String(tenant.id)]),
  database().execute<RowDataPacket[]>("SELECT COUNT(*) AS total FROM catalog_products p JOIN catalog_categories c ON c.id=p.category_id AND c.tenant_id=p.tenant_id WHERE "+where,filterValues)
 ]);
 const total=Number(counts[0]?.total??0);
 const [[themes],[products]]=await Promise.all([database().execute<RowDataPacket[]>("SELECT template_key FROM activity_storefront_templates WHERE tenant_id=? LIMIT 1",[String(tenant.id)]),database().execute<RowDataPacket[]>("SELECT p.id,p.name_ar,p.name_en,p.name_fr,p.price,p.currency,p.product_type,c.name_ar AS category_name,c.name_en AS category_name_en,c.name_fr AS category_name_fr,(SELECT i.image_url FROM catalog_images i WHERE i.product_id=p.id AND i.tenant_id=p.tenant_id ORDER BY i.sort_order LIMIT 1) AS image_url FROM catalog_products p JOIN catalog_categories c ON c.id=p.category_id AND c.tenant_id=p.tenant_id WHERE "+where+" ORDER BY p.sort_order,p.created_at,p.id LIMIT ? OFFSET ?",[...filterValues,limit,offset])]);
 const {previewTemplate}=query;
 const locale=(await cookies()).get("foon_language")?.value;
 const language:ActivityLanguage=locale==="en"||locale==="fr"?locale:"ar";
 let selected=themes[0]?.template_key?String(themes[0].template_key):null;
 if(previewTemplate&&isTemplateForActivity(activity,previewTemplate)){
  const user=await currentUserId();
  if(user){
   const [membership]=await database().execute<RowDataPacket[]>("SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' AND role IN ('owner','manager') LIMIT 1",[String(tenant.id),user]);
   if(membership.length)selected=previewTemplate;
  }
 }
 return <ActivityStorefront name={String(tenant.name)} slug={slug} activity={activity} template={selected} language={language} categories={categories.map(c=>({id:String(c.id),name:String(c.name_ar),nameEn:String(c.name_en??""),nameFr:String(c.name_fr??"")}))} selectedCategory={category} search={search} page={page} total={total} pageSize={limit} products={products.map(p=>({id:String(p.id),name:String(p.name_ar),nameEn:String(p.name_en??""),nameFr:String(p.name_fr??""),category:language==="en"?String(p.category_name_en??p.category_name):language==="fr"?String(p.category_name_fr??p.category_name):String(p.category_name),price:Number(p.price),currency:String(p.currency),imageUrl:p.image_url?String(p.image_url):null}))}/>;

}
