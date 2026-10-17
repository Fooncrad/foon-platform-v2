import {tenantEntitlement} from "@/lib/plans/entitlements";
import {assertCatalogCapacity} from "@/lib/plans/catalog-capacity";
import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {isActivityType} from "@/lib/platform/activity-presets";
import {parseCatalogMeasurements,validCatalogQuantity} from "@/lib/platform/catalog-measurements";
export const runtime="nodejs";
async function scope(request:Request){
 const user=await currentUserId();if(!user)return {error:NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401})};
 const tenant=request.headers.get("x-foon-tenant");if(!tenant)return {error:NextResponse.json({ok:false,code:"TENANT_CONTEXT_REQUIRED"},{status:400})};
 try{
  const ctx=await requireTenantMembership(user,tenant,["owner","manager"],request.method!=="GET");
  const [rows]=await database().execute<RowDataPacket[]>("SELECT activity_code,currency FROM tenant_business_profiles WHERE tenant_id=? LIMIT 1",[ctx.tenantId]);
  const activity=String(rows[0]?.activity_code??"");
  if(!isActivityType(activity)||activity==="restaurant")return {error:NextResponse.json({ok:false,code:"ACTIVITY_NOT_SUPPORTED"},{status:409})};
  const services=["carwash","laundry","automotive","salon","publicworks"].includes(activity);
  if(!(await tenantEntitlement(ctx.tenantId,services?"catalog":"digital_menu")).enabled)return {error:NextResponse.json({ok:false,code:"PLAN_FEATURE_REQUIRED"},{status:403})};
  return {tenantId:ctx.tenantId,activity,currency:String(rows[0]?.currency??"SAR")};
 }catch{return {error:NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}}
}
function validName(v:unknown){return typeof v==="string"&&v.trim().length>=2&&v.trim().length<=180}
export async function GET(request:Request){
 const ctx=await scope(request);if(ctx.error)return ctx.error;
 const params=new URL(request.url).searchParams;
 const page=Math.max(1,Math.min(100000,Number.parseInt(params.get("page")??"1",10)||1));
 const pageSize=50,offset=(page-1)*pageSize;
 const categoryId=params.get("category")?.slice(0,36)??"";
 const q=params.get("q")?.trim().slice(0,100)??"";
 const where=["p.tenant_id=?"],values:(string|number)[]=[ctx.tenantId!];
 if(categoryId){where.push("p.category_id=?");values.push(categoryId)}
 if(q){where.push("(p.name_ar LIKE ? OR p.name_en LIKE ? OR p.name_fr LIKE ?)");values.push("%"+q+"%","%"+q+"%","%"+q+"%")}
 try{
  const [[categories],[counts],[products]]=await Promise.all([
   database().execute<RowDataPacket[]>("SELECT id,name_ar,name_en,name_fr,description_ar,description_en,description_fr,image_url,enabled FROM catalog_categories WHERE tenant_id=? ORDER BY sort_order,created_at",[ctx.tenantId]),
   database().execute<RowDataPacket[]>("SELECT COUNT(*) AS total FROM catalog_products p WHERE "+where.join(" AND "),values),
   database().execute<RowDataPacket[]>("SELECT p.id,p.category_id,p.name_ar,p.name_en,p.name_fr,p.price,p.currency,p.enabled,p.product_type,p.stock_quantity,p.attributes,p.description_ar,p.description_en,p.description_fr FROM catalog_products p WHERE "+where.join(" AND ")+" ORDER BY p.sort_order,p.created_at,p.id LIMIT ? OFFSET ?",[...values,pageSize,offset])
  ]);
  return NextResponse.json({ok:true,activity:ctx.activity,currency:ctx.currency,categories,products,page,pageSize,total:Number(counts[0]?.total??0)});
 }catch{return NextResponse.json({ok:false,code:"CATALOG_UNAVAILABLE"},{status:503})}
}
export async function POST(request:Request){
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const ctx=await scope(request);if(ctx.error)return ctx.error;
 const body=await request.json().catch(()=>null);
 if(!body||!validName(body.name))return NextResponse.json({ok:false,code:"INVALID_NAME"},{status:400});
 const name=body.name.trim(),id=randomUUID();
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  if(body.kind!=="category"&&body.kind!=="product")return NextResponse.json({ok:false,code:"INVALID_KIND"},{status:400});
  await assertCatalogCapacity(db,ctx.tenantId!,false,body.kind,1,["carwash","laundry","automotive","salon","publicworks"].includes(ctx.activity!)?"catalog":"digital_menu");
  if(body.kind==="category"){
   await db.execute("INSERT INTO catalog_categories(id,tenant_id,name_ar,name_en,name_fr,description_ar,description_en,description_fr) VALUES (?,?,?,?,?,?,?,?)",[id,ctx.tenantId,name,String(body.nameEn??"").slice(0,180)||null,String(body.nameFr??"").slice(0,180)||null,...["description","descriptionEn","descriptionFr"].map(key=>typeof body[key]==="string"?body[key].slice(0,5000):null)]);
  }else if(body.kind==="product"){
   const category=String(body.categoryId??"");
   const [matches]=await db.execute<RowDataPacket[]>("SELECT id FROM catalog_categories WHERE tenant_id=? AND id=? LIMIT 1",[ctx.tenantId,category]);
   if(!matches.length)return NextResponse.json({ok:false,code:"INVALID_CATEGORY"},{status:400});
   const price=Number(body.price);
   if(!Number.isFinite(price)||price<0||price>9999999999)return NextResponse.json({ok:false,code:"INVALID_PRICE"},{status:400});
   const service=["carwash","laundry","automotive","salon","publicworks"].includes(ctx.activity!);
   await db.execute("INSERT INTO catalog_products(id,tenant_id,category_id,product_type,name_ar,name_en,name_fr,description_ar,description_en,description_fr,price,currency) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",[id,ctx.tenantId,category,service?"service":"physical",name,String(body.nameEn??"").slice(0,180)||null,String(body.nameFr??"").slice(0,180)||null,...["description","descriptionEn","descriptionFr"].map(key=>typeof body[key]==="string"?body[key].slice(0,5000):null),price,ctx.currency]);
  }else return NextResponse.json({ok:false,code:"INVALID_KIND"},{status:400});
  await db.commit();
  return NextResponse.json({ok:true,id},{status:201});
 }catch(e){await db.rollback();const code=e instanceof Error?e.message:"";return NextResponse.json({ok:false,code:["PLAN_LIMIT_REACHED","PLAN_FEATURE_REQUIRED"].includes(code)?code:"CATALOG_SAVE_FAILED"},{status:["PLAN_LIMIT_REACHED","PLAN_FEATURE_REQUIRED"].includes(code)?403:503});}finally{await db.rollback();db.release();}
}

export async function PATCH(request:Request){
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const ctx=await scope(request);if(ctx.error)return ctx.error;
 const body=await request.json().catch(()=>null);
 if(!body||!["category","product"].includes(body.kind)||typeof body.id!=="string")return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const table=body.kind==="category"?"catalog_categories":"catalog_products";
 const columns:string[]=[],values:(string|number|boolean|null)[]=[];
 if(body.name!==undefined){if(!validName(body.name))return NextResponse.json({ok:false,code:"INVALID_NAME"},{status:400});columns.push("name_ar=?");values.push(body.name.trim())}
 if(body.enabled!==undefined){if(typeof body.enabled!=="boolean")return NextResponse.json({ok:false,code:"INVALID_ENABLED"},{status:400});columns.push("enabled=?");values.push(body.enabled)}
 if(body.kind==="product"&&body.price!==undefined){const price=Number(body.price);if(!Number.isFinite(price)||price<0||price>9999999999)return NextResponse.json({ok:false,code:"INVALID_PRICE"},{status:400});columns.push("price=?");values.push(price)}
 if(body.kind==="product"&&body.categoryId!==undefined){
  const [category]=await database().execute<RowDataPacket[]>("SELECT id FROM catalog_categories WHERE tenant_id=? AND id=? LIMIT 1",[ctx.tenantId,String(body.categoryId)]);
  if(!category.length)return NextResponse.json({ok:false,code:"INVALID_CATEGORY"},{status:400});
  columns.push("category_id=?");values.push(String(body.categoryId))
 }
 if(body.kind==="product"&&body.stockQuantity!==undefined){
  const quantity=body.stockQuantity===null?null:Number(body.stockQuantity);
  if(quantity!==null&&(typeof body.stockQuantity!=="number"||!(quantity===0||validCatalogQuantity(quantity,999999999))||quantity<0||quantity>999999999))return NextResponse.json({ok:false,code:"INVALID_STOCK"},{status:400});
  columns.push("stock_quantity=?");values.push(quantity);
 }
 for(const [key,column] of [["nameEn","name_en"],["nameFr","name_fr"]] as const){
  if(body[key]===undefined)continue;
  if(typeof body[key]!=="string"||body[key].length>180)return NextResponse.json({ok:false,code:"INVALID_TRANSLATION"},{status:400});
  columns.push(column+"=?");values.push(body[key].trim()||null);
 }
 for(const [key,column] of [["description","description_ar"],["descriptionEn","description_en"],["descriptionFr","description_fr"]] as const){
  if(body[key]===undefined)continue;
  if(typeof body[key]!=="string"||body[key].length>5000)return NextResponse.json({ok:false,code:"INVALID_DESCRIPTION"},{status:400});
  columns.push(column+"=?");values.push(body[key].trim()||null);
 }
 if(body.kind==="product"&&body.measurements!==undefined){
  try{const measurements=parseCatalogMeasurements(body.measurements);columns.push("attributes=JSON_SET(COALESCE(attributes,JSON_OBJECT()),'$.measurements',JSON_EXTRACT(?,'$'))");values.push(JSON.stringify(measurements))}catch{return NextResponse.json({ok:false,code:"INVALID_MEASUREMENTS"},{status:400})}
 }
 if(body.kind==="category"&&body.imageUrl!==undefined){
  if(body.imageUrl!==null){
   if(typeof body.imageUrl!=="string"||!/^\/api\/restaurant\/assets\/[a-f0-9-]{36}$/i.test(body.imageUrl))return NextResponse.json({ok:false,code:"INVALID_IMAGE"},{status:400});
   const [assets]=await database().execute<RowDataPacket[]>("SELECT id FROM restaurant_assets WHERE tenant_id=? AND id=?",[ctx.tenantId,body.imageUrl.split("/").pop()]);
   if(!assets.length)return NextResponse.json({ok:false,code:"INVALID_IMAGE"},{status:400});
  }
  columns.push("image_url=?");values.push(body.imageUrl);
 }
 if(!columns.length)return NextResponse.json({ok:false,code:"NO_CHANGES"},{status:400});
 try{
  const [result]=await database().execute("UPDATE "+table+" SET "+columns.join(",")+" WHERE tenant_id=? AND id=?",[...values,ctx.tenantId,body.id]);
  const changed=(result as {affectedRows?:number}).affectedRows??0;
  if(!changed)return NextResponse.json({ok:false,code:"CATALOG_ITEM_NOT_FOUND"},{status:404});
  return NextResponse.json({ok:true,changed});
 }catch{return NextResponse.json({ok:false,code:"CATALOG_UPDATE_FAILED"},{status:503})}
}

export async function DELETE(request:Request){
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const ctx=await scope(request);if(ctx.error)return ctx.error;
 const body=await request.json().catch(()=>null);
 if(!body||!["category","product"].includes(body.kind)||typeof body.id!=="string"||body.id.length!==36)return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{
  if(body.kind==="category"){
   const [children]=await database().execute<RowDataPacket[]>("SELECT id FROM catalog_products WHERE tenant_id=? AND category_id=? LIMIT 1",[ctx.tenantId,body.id]);
   const [subcategories]=await database().execute<RowDataPacket[]>("SELECT id FROM catalog_categories WHERE tenant_id=? AND parent_id=? LIMIT 1",[ctx.tenantId,body.id]);
   if(children.length||subcategories.length)return NextResponse.json({ok:false,code:"CATEGORY_NOT_EMPTY"},{status:409});
  }
  const table=body.kind==="category"?"catalog_categories":"catalog_products";
  const [result]=await database().execute("DELETE FROM "+table+" WHERE tenant_id=? AND id=?",[ctx.tenantId,body.id]);
  const deleted=(result as {affectedRows?:number}).affectedRows??0;
  if(!deleted)return NextResponse.json({ok:false,code:"CATALOG_ITEM_NOT_FOUND"},{status:404});
  return NextResponse.json({ok:true,deleted});
 }catch{return NextResponse.json({ok:false,code:"CATALOG_DELETE_FAILED"},{status:503})}
}

