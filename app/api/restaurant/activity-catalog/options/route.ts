import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {tenantEntitlement} from "@/lib/plans/entitlements";
export const runtime="nodejs";
const fail=(code:string,status=400)=>NextResponse.json({ok:false,code},{status});
async function authorize(request:Request){
 const user=await currentUserId(),tenant=request.headers.get("x-foon-tenant");
 if(!user||!tenant)return null;
 try{return await requireTenantMembership(user,tenant,["owner","manager"],request.method!=="GET")}catch{return null}
}
export async function GET(request:Request){
 const ctx=await authorize(request);if(!ctx)return fail("FORBIDDEN",403);
 const product=new URL(request.url).searchParams.get("product");
 try{
  const [products]=await database().execute<RowDataPacket[]>("SELECT id FROM catalog_products WHERE tenant_id=? AND id=?",[ctx.tenantId,product??""]);
  if(!products.length)return fail("PRODUCT_NOT_FOUND",404);
  const [groups]=await database().execute<RowDataPacket[]>("SELECT * FROM catalog_option_groups WHERE tenant_id=? AND product_id=? ORDER BY sort_order,id",[ctx.tenantId,product]);
  const [values]=await database().execute<RowDataPacket[]>("SELECT v.* FROM catalog_option_values v JOIN catalog_option_groups g ON g.id=v.group_id AND g.tenant_id=v.tenant_id WHERE g.tenant_id=? AND g.product_id=? ORDER BY v.sort_order,v.id",[ctx.tenantId,product]);
  return NextResponse.json({ok:true,groups:groups.map(g=>({...g,values:values.filter(v=>v.group_id===g.id)}))});
 }catch{return fail("OPTIONS_UNAVAILABLE",503)}
}
export async function POST(request:Request){
 try{assertSameOrigin(request)}catch{return fail("FORBIDDEN",403)}
 const ctx=await authorize(request);if(!ctx)return fail("FORBIDDEN",403);
 const b=await request.json().catch(()=>null);
 if(!b||typeof b.product!=="string"||b.product.length!==36||!["group","value","deleteGroup","deleteValue"].includes(b.action))return fail("INVALID_INPUT");
 const deleting=b.action.startsWith("delete");
 if(deleting&&(typeof b.id!=="string"||b.id.length!==36))return fail("INVALID_INPUT");
 if(!deleting){
  for(const key of ["name","nameEn","nameFr"]){if(typeof (b[key]??"")!=="string"||String(b[key]??"").trim().length>180)return fail("INVALID_NAME")}
  if(typeof b.name!=="string"||b.name.trim().length<1)return fail("INVALID_NAME");
  if(b.action==="group"&&(typeof b.required!=="boolean"||!["single","multiple"].includes(b.type)||!Number.isInteger(b.max)||b.max<1||b.max>50))return fail("INVALID_SELECTION");
  if(b.action==="value"&&(typeof b.group!=="string"||typeof b.price!=="number"||!Number.isFinite(b.price)||b.price<0||b.price>9999999999||(b.stock!==null&&(!Number.isSafeInteger(b.stock)||b.stock<0||b.stock>999999999))))return fail("INVALID_VALUE");
 }
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [products]=await db.execute<RowDataPacket[]>("SELECT id FROM catalog_products WHERE tenant_id=? AND id=? FOR UPDATE",[ctx.tenantId,b.product]);
  if(!products.length){await db.rollback();return fail("PRODUCT_NOT_FOUND",404)}
  if(!(await tenantEntitlement(ctx.tenantId,"variants",db)).enabled){await db.rollback();return fail("PLAN_FEATURE_REQUIRED",403)}
  const [groups]=await db.execute<RowDataPacket[]>("SELECT id FROM catalog_option_groups WHERE tenant_id=? AND product_id=? FOR UPDATE",[ctx.tenantId,b.product]);
  if(b.action==="group"){
   if(groups.length>=20){await db.rollback();return fail("GROUP_LIMIT",409)}
   await db.execute("INSERT INTO catalog_option_groups(id,tenant_id,product_id,name_ar,name_en,name_fr,selection_type,required,min_select,max_select) VALUES (?,?,?,?,?,?,?,?,?,?)",[randomUUID(),ctx.tenantId,b.product,b.name.trim(),b.nameEn?.trim()||null,b.nameFr?.trim()||null,b.type,b.required,b.required?1:0,b.type==="single"?1:b.max]);
  }else{
   const group=b.action==="deleteGroup"?b.id:b.group;
   if(!groups.some(g=>g.id===group)){await db.rollback();return fail("GROUP_NOT_FOUND",404)}
   if(b.action==="deleteGroup")await db.execute("DELETE FROM catalog_option_groups WHERE tenant_id=? AND product_id=? AND id=?",[ctx.tenantId,b.product,b.id]);
   else if(b.action==="deleteValue")await db.execute("DELETE FROM catalog_option_values WHERE tenant_id=? AND group_id=? AND id=?",[ctx.tenantId,group,b.id]);
   else{
    const [values]=await db.execute<RowDataPacket[]>("SELECT id FROM catalog_option_values WHERE tenant_id=? AND group_id=?",[ctx.tenantId,group]);
    if(values.length>=100){await db.rollback();return fail("VALUE_LIMIT",409)}
    await db.execute("INSERT INTO catalog_option_values(id,tenant_id,group_id,name_ar,name_en,name_fr,price_delta,stock_quantity) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),ctx.tenantId,group,b.name.trim(),b.nameEn?.trim()||null,b.nameFr?.trim()||null,b.price,b.stock]);
   }
  }
  await db.commit();return NextResponse.json({ok:true});
 }catch{await db.rollback();return fail("OPTIONS_SAVE_FAILED",503)}finally{db.release()}
}
