import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import {tenantEntitlement} from "@/lib/plans/entitlements";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request){
 const user=await currentUserId();if(!user)return reply({ok:false,code:"UNAUTHENTICATED"},401);
 const tenant=request.headers.get("x-foon-tenant")??"";if(!tenant)return reply({ok:false,code:"TENANT_REQUIRED"},400);
 let tenantId:string;
 try{tenantId=(await requireTenantMembership(user,tenant,["owner","manager"])).tenantId;}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 if(!(await tenantEntitlement(tenantId,"display_advertising")).enabled)return reply({ok:false,code:"PLAN_FEATURE_REQUIRED"},403);
 try{
  const [[tenants],[profile]]=await Promise.all([
   database().execute<RowDataPacket[]>("SELECT kind FROM tenants WHERE id=? AND status='active' LIMIT 1",[tenantId]),
   database().execute<RowDataPacket[]>("SELECT activity_code,currency FROM tenant_business_profiles WHERE tenant_id=? LIMIT 1",[tenantId])
  ]);
  if(!tenants.length)return reply({ok:false,code:"TENANT_UNAVAILABLE"},404);
  const currency=String(profile[0]?.currency??"SAR");
  if(String(tenants[0].kind)==="restaurant"){
   const [items]=await database().execute<RowDataPacket[]>(
    "SELECT i.id,i.name AS name_ar,COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.nameEn')),'') AS name_en,COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.nameFr')),'') AS name_fr,i.description AS description_ar,i.image_url,i.price,i.currency,c.name AS category_name FROM restaurant_menu_items i JOIN restaurant_menu_categories c ON c.id=i.category_id AND c.tenant_id=i.tenant_id LEFT JOIN restaurant_resources r ON r.id=i.id AND r.tenant_id=i.tenant_id AND r.kind='menu_item' WHERE i.tenant_id=? AND i.enabled=TRUE AND c.enabled=TRUE ORDER BY c.sort_order,i.sort_order,i.name LIMIT 1000",
    [tenantId]
   );
   return reply({ok:true,activity:String(profile[0]?.activity_code??"restaurant"),sourceType:"restaurant_menu_item",currency,sources:items.map(x=>({id:String(x.id),sourceType:"restaurant_menu_item",name:String(x.name_ar),nameEn:String(x.name_en??""),nameFr:String(x.name_fr??""),description:String(x.description_ar??""),imageUrl:x.image_url?String(x.image_url):null,price:Number(x.price),currency:String(x.currency??currency),category:String(x.category_name??"")}))});
  }
  const [items]=await database().execute<RowDataPacket[]>(
   "SELECT p.id,p.name_ar,p.name_en,p.name_fr,p.description_ar,p.price,p.currency,p.product_type,c.name_ar AS category_name,(SELECT i.image_url FROM catalog_images i WHERE i.tenant_id=p.tenant_id AND i.product_id=p.id ORDER BY i.sort_order,i.id LIMIT 1) AS image_url FROM catalog_products p JOIN catalog_categories c ON c.id=p.category_id AND c.tenant_id=p.tenant_id WHERE p.tenant_id=? AND p.enabled=TRUE AND c.enabled=TRUE AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.attributes,'$.__foon_archived')),'0') NOT IN ('1','true') ORDER BY c.sort_order,p.sort_order,p.name_ar LIMIT 1000",
   [tenantId]
  );
  return reply({ok:true,activity:String(profile[0]?.activity_code??""),sourceType:"catalog_product",currency,sources:items.map(x=>({id:String(x.id),sourceType:"catalog_product",name:String(x.name_ar),nameEn:String(x.name_en??""),nameFr:String(x.name_fr??""),description:String(x.description_ar??""),imageUrl:x.image_url?String(x.image_url):null,price:Number(x.price),currency:String(x.currency??currency),category:String(x.category_name??""),productType:String(x.product_type??"")}))});
 }catch{return reply({ok:false,code:"DISPLAY_SOURCES_UNAVAILABLE"},503);}
}
