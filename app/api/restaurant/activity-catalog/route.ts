import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {isActivityType} from "@/lib/platform/activity-presets";
export const runtime="nodejs";
async function scope(request:Request){
 const user=await currentUserId();if(!user)return {error:NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401})};
 const tenant=request.headers.get("x-foon-tenant");if(!tenant)return {error:NextResponse.json({ok:false,code:"TENANT_CONTEXT_REQUIRED"},{status:400})};
 try{
  const ctx=await requireTenantMembership(user,tenant,["owner","manager"],request.method!=="GET");
  const [rows]=await database().execute<RowDataPacket[]>("SELECT activity_code FROM tenant_business_profiles WHERE tenant_id=? LIMIT 1",[ctx.tenantId]);
  const activity=String(rows[0]?.activity_code??"");
  if(!isActivityType(activity)||activity==="restaurant")return {error:NextResponse.json({ok:false,code:"ACTIVITY_NOT_SUPPORTED"},{status:409})};
  return {tenantId:ctx.tenantId,activity};
 }catch{return {error:NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}}
}
function validName(v:unknown){return typeof v==="string"&&v.trim().length>=2&&v.trim().length<=180}
export async function GET(request:Request){
 const ctx=await scope(request);if(ctx.error)return ctx.error;
 try{
  const [[categories],[products]]=await Promise.all([
   database().execute<RowDataPacket[]>("SELECT id,name_ar,name_en,name_fr,enabled FROM catalog_categories WHERE tenant_id=? ORDER BY sort_order,created_at",[ctx.tenantId]),
   database().execute<RowDataPacket[]>("SELECT id,category_id,name_ar,name_en,name_fr,price,currency,enabled,product_type FROM catalog_products WHERE tenant_id=? ORDER BY sort_order,created_at LIMIT 500",[ctx.tenantId])
  ]);
  return NextResponse.json({ok:true,activity:ctx.activity,categories,products});
 }catch{return NextResponse.json({ok:false,code:"CATALOG_UNAVAILABLE"},{status:503})}
}
export async function POST(request:Request){
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const ctx=await scope(request);if(ctx.error)return ctx.error;
 const body=await request.json().catch(()=>null);
 if(!body||!validName(body.name))return NextResponse.json({ok:false,code:"INVALID_NAME"},{status:400});
 const name=body.name.trim(),id=randomUUID();
 try{
  if(body.kind==="category"){
   await database().execute("INSERT INTO catalog_categories(id,tenant_id,name_ar,name_en,name_fr) VALUES (?,?,?,?,?)",[id,ctx.tenantId,name,String(body.nameEn??"").slice(0,180)||null,String(body.nameFr??"").slice(0,180)||null]);
  }else if(body.kind==="product"){
   const category=String(body.categoryId??"");
   const [matches]=await database().execute<RowDataPacket[]>("SELECT id FROM catalog_categories WHERE tenant_id=? AND id=? LIMIT 1",[ctx.tenantId,category]);
   if(!matches.length)return NextResponse.json({ok:false,code:"INVALID_CATEGORY"},{status:400});
   const price=Number(body.price);
   if(!Number.isFinite(price)||price<0||price>9999999999)return NextResponse.json({ok:false,code:"INVALID_PRICE"},{status:400});
   const service=["carwash","laundry","automotive","salon","publicworks"].includes(ctx.activity!);
   await database().execute("INSERT INTO catalog_products(id,tenant_id,category_id,product_type,name_ar,name_en,name_fr,price,currency) VALUES (?,?,?,?,?,?,?,?,?)",[id,ctx.tenantId,category,service?"service":"physical",name,String(body.nameEn??"").slice(0,180)||null,String(body.nameFr??"").slice(0,180)||null,price,"SAR"]);
  }else return NextResponse.json({ok:false,code:"INVALID_KIND"},{status:400});
  return NextResponse.json({ok:true,id},{status:201});
 }catch{return NextResponse.json({ok:false,code:"CATALOG_SAVE_FAILED"},{status:503})}
}
