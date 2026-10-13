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
 const isRestaurant=String(tenant.kind)==="restaurant";
 if(isRestaurant)return <PublicMenu {...await publicMenuData({id:String(tenant.id),name:String(tenant.name)},slug)}/>;
 const [profiles]=await database().execute<RowDataPacket[]>("SELECT activity_code FROM tenant_business_profiles WHERE tenant_id=? LIMIT 1",[String(tenant.id)]);
 const activity=String(profiles[0]?.activity_code??"");
 const [themes]=await database().execute<RowDataPacket[]>("SELECT template_key FROM activity_storefront_templates WHERE tenant_id=? LIMIT 1",[String(tenant.id)]);
 return <ActivityStorefront name={String(tenant.name)} slug={slug} activity={activity} template={themes[0]?.template_key?String(themes[0].template_key):null}/>;

}
