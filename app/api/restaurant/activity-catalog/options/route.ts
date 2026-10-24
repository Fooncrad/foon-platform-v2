import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {requireAllAdditionalBranchesUnlocked} from "@/lib/restaurant/branch-pin";
import {combinationKey} from "@/lib/restaurant/activity-pos";
import {validCatalogQuantity} from "@/lib/platform/catalog-measurements";
import {tenantEntitlement} from "@/lib/plans/entitlements";
export const runtime="nodejs";
const fail=(code:string,status=400)=>NextResponse.json({ok:false,code},{status});
async function authorize(request:Request){
 const user=await currentUserId(),tenant=request.headers.get("x-foon-tenant");
 if(!user||!tenant)return null;
 try{const ctx=await requireTenantMembership(user,tenant,["owner","manager"],request.method!=="GET");if(request.method!=="GET")await requireAllAdditionalBranchesUnlocked(ctx.tenantId,user);return ctx;}catch{return null}
}
export async function GET(request:Request){
 const ctx=await authorize(request);if(!ctx)return fail("FORBIDDEN",403);
 const product=new URL(request.url).searchParams.get("product");
 try{
  const [products]=await database().execute<RowDataPacket[]>("SELECT id FROM catalog_products WHERE tenant_id=? AND id=?",[ctx.tenantId,product??""]);
  if(!products.length)return fail("PRODUCT_NOT_FOUND",404);
  const [groups]=await database().execute<RowDataPacket[]>("SELECT * FROM catalog_option_groups WHERE tenant_id=? AND product_id=? ORDER BY sort_order,id",[ctx.tenantId,product]);
  const [values]=await database().execute<RowDataPacket[]>("SELECT v.* FROM catalog_option_values v JOIN catalog_option_groups g ON g.id=v.group_id AND g.tenant_id=v.tenant_id WHERE g.tenant_id=? AND g.product_id=? ORDER BY v.sort_order,v.id",[ctx.tenantId,product]);
  const [variants]=await database().execute<RowDataPacket[]>("SELECT id,option_ids,sku,stock_quantity,enabled FROM catalog_variants WHERE tenant_id=? AND product_id=? ORDER BY id",[ctx.tenantId,product]);
  return NextResponse.json({ok:true,variants,groups:groups.map(g=>({...g,values:values.filter(v=>v.group_id===g.id)}))});
 }catch{return fail("OPTIONS_UNAVAILABLE",503)}
}
export async function POST(request:Request){
 try{assertSameOrigin(request)}catch{return fail("FORBIDDEN",403)}
 const ctx=await authorize(request);if(!ctx)return fail("FORBIDDEN",403);
 const b=await request.json().catch(()=>null);
 if(!b||typeof b.product!=="string"||b.product.length!==36||!["group","value","deleteGroup","deleteValue","variant","deleteVariant","updateValue","updateGroup","toggleGroup","toggleValue"].includes(b.action))return fail("INVALID_INPUT");
 const deleting=b.action.startsWith("delete");
 if(deleting&&(typeof b.id!=="string"||b.id.length!==36))return fail("INVALID_INPUT");
 if(!deleting&&b.action!=="variant"&&!b.action.startsWith("toggle")){
  for(const key of ["name","nameEn","nameFr"]){if(typeof (b[key]??"")!=="string"||String(b[key]??"").trim().length>180)return fail("INVALID_NAME")}
  if(typeof b.name!=="string"||b.name.trim().length<1)return fail("INVALID_NAME");
  if(["group","updateGroup"].includes(b.action)&&(typeof b.required!=="boolean"||!["single","multiple"].includes(b.type)||!Number.isInteger(b.max)||b.max<1||b.max>50||!Number.isInteger(b.min)||b.min<0||b.min>b.max||b.required&&b.min<1||b.type==="single"&&b.min>1))return fail("INVALID_SELECTION");
  if(["group","updateGroup","value","updateValue"].includes(b.action)&&(b.sortOrder!==undefined&&(!Number.isInteger(b.sortOrder)||b.sortOrder<0||b.sortOrder>1000000)))return fail("INVALID_SORT_ORDER");
  if(["value","updateValue"].includes(b.action)&&(typeof b.group!=="string"||typeof b.price!=="number"||!Number.isFinite(b.price)||b.price<0||b.price>9999999999||(b.stock!==null&&(!(b.stock===0||validCatalogQuantity(b.stock,999999999))||b.stock<0||b.stock>999999999))))return fail("INVALID_VALUE");
 }
 if(["variant","updateValue","updateGroup","toggleGroup","toggleValue"].includes(b.action)&&b.id!==undefined&&(typeof b.id!=="string"||b.id.length!==36))return fail("INVALID_INPUT");
 if(b.action.startsWith("toggle")&&(typeof b.id!=="string"||b.id.length!==36||typeof b.enabled!=="boolean"))return fail("INVALID_INPUT");
 if(b.action==="variant"&&(!Array.isArray(b.options)||!b.options.length||b.options.length>20||b.options.some((id:unknown)=>typeof id!=="string"||id.length!==36)||new Set(b.options).size!==b.options.length||typeof b.sku!=="string"||b.sku.length>100||(b.stock!==null&&!(b.stock===0||validCatalogQuantity(b.stock,999999999)))))return fail("INVALID_VARIANT");
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [products]=await db.execute<RowDataPacket[]>("SELECT id FROM catalog_products WHERE tenant_id=? AND id=? FOR UPDATE",[ctx.tenantId,b.product]);
  if(!products.length){await db.rollback();return fail("PRODUCT_NOT_FOUND",404)}
  if(!(await tenantEntitlement(ctx.tenantId,"variants",db)).enabled){await db.rollback();return fail("PLAN_FEATURE_REQUIRED",403)}
  const [groups]=await db.execute<RowDataPacket[]>("SELECT id FROM catalog_option_groups WHERE tenant_id=? AND product_id=? FOR UPDATE",[ctx.tenantId,b.product]);
  if(b.action==="toggleGroup"){
   if(!groups.some(g=>g.id===b.id)){await db.rollback();return fail("GROUP_NOT_FOUND",404)}
   await db.execute("UPDATE catalog_option_groups SET enabled=? WHERE tenant_id=? AND product_id=? AND id=?",[b.enabled,ctx.tenantId,b.product,b.id]);
  }else if(b.action==="toggleValue"){
   const [found]=await db.execute<RowDataPacket[]>("SELECT v.id FROM catalog_option_values v JOIN catalog_option_groups g ON g.id=v.group_id AND g.tenant_id=v.tenant_id WHERE v.tenant_id=? AND g.product_id=? AND v.id=? FOR UPDATE",[ctx.tenantId,b.product,b.id]);
   if(!found.length){await db.rollback();return fail("VALUE_NOT_FOUND",404)}
   await db.execute("UPDATE catalog_option_values SET enabled=? WHERE tenant_id=? AND id=?",[b.enabled,ctx.tenantId,b.id]);
  }else if(b.action==="variant"){
   const [values]=await db.execute<RowDataPacket[]>("SELECT v.id,v.group_id,g.selection_type,g.required,g.min_select,g.max_select FROM catalog_option_values v JOIN catalog_option_groups g ON g.id=v.group_id AND g.tenant_id=v.tenant_id WHERE g.tenant_id=? AND g.product_id=? AND g.enabled=TRUE AND v.enabled=TRUE",[ctx.tenantId,b.product]);
   if(b.options.some((id:string)=>!values.some(v=>v.id===id))){await db.rollback();return fail("INVALID_OPTIONS")}
   const [activeGroups]=await db.execute<RowDataPacket[]>("SELECT id,selection_type,required,min_select,max_select FROM catalog_option_groups WHERE tenant_id=? AND product_id=? AND enabled=TRUE",[ctx.tenantId,b.product]);
   for(const g of activeGroups){const count=values.filter(v=>v.group_id===g.id&&b.options.includes(v.id)).length;if(count<(g.required?Math.max(1,Number(g.min_select)):Number(g.min_select))||count>(g.selection_type==="single"?1:Number(g.max_select))){await db.rollback();return fail("INVALID_OPTIONS")}}
   const [existing]=await db.execute<RowDataPacket[]>("SELECT id FROM catalog_variants WHERE tenant_id=? AND product_id=?",[ctx.tenantId,b.product]);
   if(existing.length>=500&&!b.id){await db.rollback();return fail("VARIANT_LIMIT",409)}
   if(b.id&&!existing.some(v=>v.id===b.id)){await db.rollback();return fail("VARIANT_NOT_FOUND",404)}
   if(b.id)await db.execute("UPDATE catalog_variants SET combination_key=?,option_ids=?,sku=?,stock_quantity=?,enabled=TRUE WHERE tenant_id=? AND product_id=? AND id=?",[combinationKey(b.options),JSON.stringify(b.options),b.sku||null,b.stock,ctx.tenantId,b.product,b.id]);
   else await db.execute("INSERT INTO catalog_variants(id,tenant_id,product_id,combination_key,option_ids,sku,stock_quantity) VALUES (?,?,?,?,?,?,?)",[randomUUID(),ctx.tenantId,b.product,combinationKey(b.options),JSON.stringify(b.options),b.sku||null,b.stock]);
  }else if(b.action==="deleteVariant"){
   const [found]=await db.execute<RowDataPacket[]>("SELECT id FROM catalog_variants WHERE tenant_id=? AND product_id=? AND id=?",[ctx.tenantId,b.product,b.id]);
   if(!found.length){await db.rollback();return fail("VARIANT_NOT_FOUND",404)}
   await db.execute("UPDATE catalog_variants SET enabled=FALSE WHERE tenant_id=? AND product_id=? AND id=?",[ctx.tenantId,b.product,b.id]);
  }else if(b.action==="updateGroup"){
   if(!groups.some(g=>g.id===b.id)){await db.rollback();return fail("GROUP_NOT_FOUND",404)}
   await db.execute("UPDATE catalog_option_groups SET name_ar=?,name_en=?,name_fr=?,selection_type=?,required=?,min_select=?,max_select=?,sort_order=COALESCE(?,sort_order) WHERE tenant_id=? AND product_id=? AND id=?",[b.name.trim(),b.nameEn?.trim()||null,b.nameFr?.trim()||null,b.type,b.required,b.required?Math.max(1,b.min):b.min,b.type==="single"?1:b.max,b.sortOrder??null,ctx.tenantId,b.product,b.id]);
  }
  else if(b.action==="group"){
   if(groups.length>=20){await db.rollback();return fail("GROUP_LIMIT",409)}
   await db.execute("INSERT INTO catalog_option_groups(id,tenant_id,product_id,name_ar,name_en,name_fr,selection_type,required,min_select,max_select,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)",[randomUUID(),ctx.tenantId,b.product,b.name.trim(),b.nameEn?.trim()||null,b.nameFr?.trim()||null,b.type,b.required,b.required?Math.max(1,b.min):b.min,b.type==="single"?1:b.max,b.sortOrder??0]);
  }else{
   const group=b.action==="deleteGroup"?b.id:b.group;
   if(!groups.some(g=>g.id===group)){await db.rollback();return fail("GROUP_NOT_FOUND",404)}
   if(b.action==="deleteGroup")await db.execute("DELETE FROM catalog_option_groups WHERE tenant_id=? AND product_id=? AND id=?",[ctx.tenantId,b.product,b.id]);
   else if(b.action==="deleteValue"){
    const [found]=await db.execute<RowDataPacket[]>("SELECT id FROM catalog_option_values WHERE tenant_id=? AND group_id=? AND id=?",[ctx.tenantId,group,b.id]);
    if(!found.length){await db.rollback();return fail("VALUE_NOT_FOUND",404)}
    await db.execute("DELETE FROM catalog_option_values WHERE tenant_id=? AND group_id=? AND id=?",[ctx.tenantId,group,b.id]);
   }
   else if(b.action==="updateValue"){
    if(typeof b.id!=="string"){await db.rollback();return fail("INVALID_INPUT")}
    const [found]=await db.execute<RowDataPacket[]>("SELECT id FROM catalog_option_values WHERE tenant_id=? AND group_id=? AND id=?",[ctx.tenantId,group,b.id]);
    if(!found.length){await db.rollback();return fail("VALUE_NOT_FOUND",404)}
    await db.execute("UPDATE catalog_option_values SET name_ar=?,name_en=?,name_fr=?,price_delta=?,stock_quantity=?,sort_order=COALESCE(?,sort_order) WHERE tenant_id=? AND group_id=? AND id=?",[b.name.trim(),b.nameEn?.trim()||null,b.nameFr?.trim()||null,b.price,b.stock,b.sortOrder??null,ctx.tenantId,group,b.id]);
   }else{
    const [values]=await db.execute<RowDataPacket[]>("SELECT id FROM catalog_option_values WHERE tenant_id=? AND group_id=?",[ctx.tenantId,group]);
    if(values.length>=100){await db.rollback();return fail("VALUE_LIMIT",409)}
    await db.execute("INSERT INTO catalog_option_values(id,tenant_id,group_id,name_ar,name_en,name_fr,price_delta,stock_quantity,sort_order) VALUES (?,?,?,?,?,?,?,?,?)",[randomUUID(),ctx.tenantId,group,b.name.trim(),b.nameEn?.trim()||null,b.nameFr?.trim()||null,b.price,b.stock,b.sortOrder??0]);
   }
  }
  await db.commit();return NextResponse.json({ok:true});
 }catch(error){await db.rollback();return fail((error as {code?:string}).code==="ER_DUP_ENTRY"?"COMBINATION_EXISTS":"OPTIONS_SAVE_FAILED",(error as {code?:string}).code==="ER_DUP_ENTRY"?409:503)}finally{db.release()}
}
