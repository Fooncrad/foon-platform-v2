import StorefrontReceipt from "./storefront-receipt";
import {catalogQuantityPolicy} from "@/lib/platform/catalog-measurements";
import {customerCartAvailable} from "@/lib/platform/customer-checkout";
import {tenantEntitlement} from "@/lib/plans/entitlements";
import {notFound} from "next/navigation";
import {cookies} from "next/headers";
import type {ActivityLanguage} from "@/lib/platform/activity-presets";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {parseData} from "@/lib/restaurant/operations";
import PublicMenu from "./public-menu";
import ActivityStorefront from "./activity-storefront";
import {isTemplateForActivity} from "@/lib/platform/activity-templates";
import {currentUserId} from "@/lib/auth/session";
import {publicMenuData} from "@/lib/restaurant/public-menu";
import {tenantPublicControls} from "@/lib/tenant/public-controls";

import {validStoreSlug} from "@/scripts/store-slug.mjs";

export async function generateMetadata({params}:{params:Promise<{slug:string}>}){
 const {slug:raw}=await params;
 const slug=raw.toLowerCase();
 if(!validStoreSlug(slug,true))return {title:"النشاط غير موجود | FOON",robots:{index:false,follow:false}};
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

async function PublicTenantPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{previewTemplate?:string;category?:string;page?:string;q?:string}>}){
 const {slug:raw}=await params;
 const slug=raw.toLowerCase();
 if(!validStoreSlug(slug,true))notFound();
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
 const requestedPage=Number(query.page??1);
 const page=Math.max(1,Math.min(100000,Number.isSafeInteger(requestedPage)?requestedPage:1));
 const limit=24;
 const filters=["p.tenant_id=?","p.enabled=TRUE","c.enabled=TRUE"];
 const filterValues:(string|number)[]=[String(tenant.id)];
 if(category){filters.push("c.id=?");filterValues.push(category)}
 if(search){filters.push("(p.name_ar LIKE ? OR p.name_en LIKE ? OR p.name_fr LIKE ?)");filterValues.push(...Array(3).fill("%"+search+"%"))}
 const where=filters.join(" AND ");
 let catalogError=false;
 let categories:RowDataPacket[]=[];
 let counts:RowDataPacket[]=[];
 try{const [rows]=await database().execute<RowDataPacket[]>("SELECT id,name_ar,name_en,name_fr,description_ar,description_en,description_fr,image_url FROM catalog_categories WHERE tenant_id=? AND enabled=TRUE ORDER BY sort_order,created_at",[String(tenant.id)]);categories=rows;}
 catch(error){console.error("[FOON_STOREFRONT_CATEGORIES]",{slug,tenantId:String(tenant.id),error});}
 try{const [rows]=await database().execute<RowDataPacket[]>("SELECT COUNT(*) AS total FROM catalog_products p JOIN catalog_categories c ON c.id=p.category_id AND c.tenant_id=p.tenant_id WHERE "+where,filterValues);counts=rows;}
 catch(error){catalogError=true;console.error("[FOON_STOREFRONT_CATALOG]",{slug,tenantId:String(tenant.id),stage:"count",error});}
 const total=Number(counts[0]?.total??0);
 const safePage=Math.min(page,Math.max(1,Math.ceil(total/limit)));
 const safeOffset=(safePage-1)*limit;
 let themes:RowDataPacket[]=[];
 let products:RowDataPacket[]=[];
 // A missing optional theme must never hide an otherwise available catalog.
 try{const [themeRows]=await database().execute<RowDataPacket[]>("SELECT template_key FROM activity_storefront_templates WHERE tenant_id=? LIMIT 1",[String(tenant.id)]);themes=themeRows;}catch(error){console.error("[FOON_STOREFRONT_THEME]",{slug,tenantId:String(tenant.id),error});}
 if(!catalogError)try{
  const [productRows]=await database().execute<RowDataPacket[]>("SELECT p.id,p.name_ar,p.name_en,p.name_fr,p.description_ar,p.description_en,p.description_fr,p.price,p.currency,p.product_type,p.attributes,c.name_ar AS category_name,c.name_en AS category_name_en,c.name_fr AS category_name_fr,(SELECT i.image_url FROM catalog_images i WHERE i.product_id=p.id AND i.tenant_id=p.tenant_id ORDER BY i.sort_order LIMIT 1) AS image_url FROM catalog_products p JOIN catalog_categories c ON c.id=p.category_id AND c.tenant_id=p.tenant_id WHERE "+where+" ORDER BY p.sort_order,p.created_at,p.id LIMIT ? OFFSET ?",[...filterValues,limit,safeOffset]);
  products=productRows;
 }catch(error){
  // Image metadata is optional. A missing catalog_images table must not hide products.
  console.error("[FOON_STOREFRONT_IMAGES]",{slug,tenantId:String(tenant.id),error});
  try{
   const [fallbackRows]=await database().execute<RowDataPacket[]>("SELECT p.id,p.name_ar,p.name_en,p.name_fr,p.description_ar,p.description_en,p.description_fr,p.price,p.currency,p.product_type,p.attributes,c.name_ar AS category_name,c.name_en AS category_name_en,c.name_fr AS category_name_fr,NULL AS image_url FROM catalog_products p JOIN catalog_categories c ON c.id=p.category_id AND c.tenant_id=p.tenant_id WHERE "+where+" ORDER BY p.sort_order,p.created_at,p.id LIMIT ? OFFSET ?",[...filterValues,limit,safeOffset]);
   products=fallbackRows;
  }catch(fallbackError){catalogError=true;console.error("[FOON_STOREFRONT_CATALOG]",{slug,tenantId:String(tenant.id),stage:"products",error:fallbackError});}
 }

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
 const publicControls=await tenantPublicControls(String(tenant.id));
 const checkoutEnabled=publicControls.sales&&publicControls.cart&&publicControls.catalog&&customerCartAvailable(activity)&&(await tenantEntitlement(String(tenant.id),"orders")).enabled;
 const serviceActivities=["carwash","laundry","automotive","salon","publicworks"];
 const serviceCatalogEnabled=serviceActivities.includes(activity)&&(await tenantEntitlement(String(tenant.id),"catalog")).enabled;
 const appointmentEnabled=serviceCatalogEnabled&&["carwash","automotive","salon"].includes(activity)&&(await tenantEntitlement(String(tenant.id),"appointments")).enabled;
 const requestMode=serviceCatalogEnabled&&publicControls.serviceRequests&&publicControls.catalog?(activity==="publicworks"?"quote":appointmentEnabled?"appointment":"inquiry"):null;
 const cartUser=(checkoutEnabled||serviceCatalogEnabled)?await currentUserId():null;
 const [cartLinks]=cartUser?await database().execute<RowDataPacket[]>("SELECT 1 FROM tenant_customers WHERE tenant_id=? AND user_id=? LIMIT 1",[String(tenant.id),cartUser]):[[]];
 const [contactRows]=cartUser?await database().execute<RowDataPacket[]>("SELECT phone FROM user_profiles WHERE user_id=? LIMIT 1",[cartUser]):[[]];
 const [lastDelivery]=cartUser?await database().execute<RowDataPacket[]>("SELECT order_notes FROM restaurant_orders WHERE customer_user_id=? AND channel='delivery' AND order_notes LIKE 'Delivery address: %' ORDER BY created_at DESC LIMIT 1",[cartUser]):[[]];
 const savedAddress=String(lastDelivery[0]?.order_notes??"").replace(/^Delivery address: /,"");
 const [brandingRows]=await database().execute<RowDataPacket[]>("SELECT data FROM restaurant_resources WHERE tenant_id=? AND kind='storefront_config' AND status='active' AND archived=FALSE LIMIT 1",[String(tenant.id)]);
 return <ActivityStorefront controls={publicControls} branding={brandingRows.length?parseData(brandingRows[0].data):{}} checkoutEnabled={checkoutEnabled} requestMode={requestMode as "appointment"|"quote"|"inquiry"|null} customerPhone={String(contactRows[0]?.phone??"")} deliveryAddress={savedAddress} signedIn={Boolean(cartUser)} linked={cartLinks.length>0} name={String(tenant.name)} slug={slug} activity={activity} template={selected} language={language} categories={categories.map(c=>({id:String(c.id),name:String(c.name_ar),nameEn:String(c.name_en??""),nameFr:String(c.name_fr??""),description:language==="en"?String(c.description_en??""):language==="fr"?String(c.description_fr??""):String(c.description_ar??""),imageUrl:c.image_url?String(c.image_url):null}))} selectedCategory={category} search={search} page={safePage} total={total} pageSize={limit} catalogError={catalogError} products={products.map(p=>({id:String(p.id),name:String(p.name_ar),nameEn:String(p.name_en??""),nameFr:String(p.name_fr??""),description:language==="en"?String(p.description_en??""):language==="fr"?String(p.description_fr??""):String(p.description_ar??""),category:language==="en"?String(p.category_name_en??p.category_name):language==="fr"?String(p.category_name_fr??p.category_name):String(p.category_name),productType:String(p.product_type),...catalogQuantityPolicy(p.attributes),price:Number(p.price),currency:String(p.currency),imageUrl:p.image_url?String(p.image_url):null}))}/>;

}

export default async function StorePage(props:Parameters<typeof PublicTenantPage>[0]){
 const content=await PublicTenantPage(props);const {slug}=await props.params;
 return <>{content}<StorefrontReceipt slug={slug.toLowerCase()} language={(await cookies()).get("foon_language")?.value??"ar"}/></>;
}
