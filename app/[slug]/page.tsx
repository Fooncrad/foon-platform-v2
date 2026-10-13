import {notFound} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import PublicMenu from "./public-menu";
import ActivityStorefront from "./activity-storefront";
import {publicMenuData} from "@/lib/restaurant/public-menu";

import {validStoreSlug} from "@/scripts/store-slug.mjs";

export async function generateMetadata({params}:{params:Promise<{slug:string}>}){
 const {slug:raw}=await params;
 const slug=raw.toLowerCase();
 if(!validStoreSlug(slug))return {title:"النشاط غير موجود | FOON",robots:{index:false,follow:false}};
 try{
  const [rows]=await database().execute<RowDataPacket[]>("SELECT name,kind,status FROM tenants WHERE slug=? LIMIT 1",[slug]);
  const tenant=rows[0];
  if(!tenant||tenant.status!=="active")return {title:"النشاط غير موجود | FOON",robots:{index:false,follow:false}};
  const name=String(tenant.name);
  return {title:name+" | FOON",description:(tenant.kind==="restaurant"?"اكتشف مطعم ":"اكتشف متجر ")+name+" على منصة FOON.",alternates:{canonical:"/"+encodeURIComponent(slug)}};
 }catch{return {title:"FOON",robots:{index:false,follow:false}}}
}

export default async function PublicTenantPage({params}:{params:Promise<{slug:string}>}){
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
 const [[themes],[products]]=await Promise.all([database().execute<RowDataPacket[]>("SELECT template_key FROM activity_storefront_templates WHERE tenant_id=? LIMIT 1",[String(tenant.id)]),database().execute<RowDataPacket[]>("SELECT p.id,p.name_ar,p.name_en,p.name_fr,p.price,p.currency,p.product_type,c.name_ar AS category_name,(SELECT i.image_url FROM catalog_images i WHERE i.product_id=p.id AND i.tenant_id=p.tenant_id ORDER BY i.sort_order LIMIT 1) AS image_url FROM catalog_products p JOIN catalog_categories c ON c.id=p.category_id AND c.tenant_id=p.tenant_id WHERE p.tenant_id=? AND p.enabled=TRUE AND c.enabled=TRUE ORDER BY p.sort_order,p.created_at LIMIT 100",[String(tenant.id)])]);
 return <ActivityStorefront name={String(tenant.name)} slug={slug} activity={activity} template={themes[0]?.template_key?String(themes[0].template_key):null} products={products.map(p=>({id:String(p.id),name:String(p.name_ar),nameEn:String(p.name_en??""),nameFr:String(p.name_fr??""),category:String(p.category_name),price:Number(p.price),currency:String(p.currency),imageUrl:p.image_url?String(p.image_url):null}))}/>;

}
