import {squareImage} from "@/lib/media/square-image";
import {assertTenantMediaSpace} from "@/lib/media/account-quota";
import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {tenantEntitlement} from "@/lib/plans/entitlements";
import {assertSameOrigin} from "@/lib/security/origin";
export const runtime="nodejs";
const fail=(code:string,status=400)=>NextResponse.json({ok:false,code},{status});
async function authorize(request:Request){
 const user=await currentUserId(),tenant=request.headers.get("x-foon-tenant");
 if(!user||!tenant)return null;
 try{return {...await requireTenantMembership(user,tenant,["owner","manager"],request.method!=="GET"),user};}catch{return null}
}
export async function GET(request:Request){
 const ctx=await authorize(request);if(!ctx)return fail("FORBIDDEN",403);
 const params=new URL(request.url).searchParams,product=params.get("product"),variant=params.get("variant");
 if(!product||!variant)return fail("INVALID_INPUT");
 try{
  const [found]=await database().execute<RowDataPacket[]>("SELECT id FROM catalog_variants WHERE tenant_id=? AND product_id=? AND id=?",[ctx.tenantId,product,variant]);
  if(!found.length)return fail("VARIANT_NOT_FOUND",404);
  const [images]=await database().execute<RowDataPacket[]>("SELECT id,image_url,sort_order FROM catalog_variant_images WHERE tenant_id=? AND product_id=? AND variant_id=? ORDER BY sort_order,id",[ctx.tenantId,product,variant]);
  return NextResponse.json({ok:true,images});
 }catch{return fail("VARIANT_IMAGES_UNAVAILABLE",503)}
}
async function mutate(request:Request){
 try{assertSameOrigin(request)}catch{return fail("FORBIDDEN",403)}
 const ctx=await authorize(request);if(!ctx)return fail("FORBIDDEN",403);
 if(!(await tenantEntitlement(ctx.tenantId,"variants")).enabled)return fail("PLAN_FEATURE_REQUIRED",403);
 if(Number(request.headers.get("content-length")??0)>3*1024*1024)return fail("IMAGE_TOO_LARGE",413);
 let body:Record<string,unknown>|null=null,bytes:Buffer|null=null,mime:string|null=null;
 if(request.method==="POST"&&request.headers.get("content-type")?.startsWith("multipart/form-data")){
  const form=await request.formData().catch(()=>null),file=form?.get("file");
  if(!(file instanceof File)||!file.size||file.size>2*1024*1024)return fail("INVALID_IMAGE");
  bytes=Buffer.from(await file.arrayBuffer());
  mime=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?"image/png":bytes[0]===255&&bytes[1]===216&&bytes[2]===255?"image/jpeg":bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP"?"image/webp":null;
  if(!mime||file.type!==mime)return fail("INVALID_IMAGE");
  try{bytes=await squareImage(bytes);mime="image/jpeg";}catch{return fail("INVALID_IMAGE");}
  body={product:form?.get("product"),variant:form?.get("variant")};
 }else body=await request.json().catch(()=>null);
 if(!body||typeof body.product!=="string"||typeof body.variant!=="string"||body.product.length!==36||body.variant.length!==36)return fail("INVALID_INPUT");
 if(request.method==="DELETE"&&typeof body.id!=="string")return fail("INVALID_INPUT");
 if(request.method==="PATCH"&&(!Array.isArray(body.ids)||body.ids.some(id=>typeof id!=="string")||new Set(body.ids).size!==body.ids.length))return fail("INVALID_ORDER");
 let existingImage="";
 if(request.method==="POST"&&!bytes){if(typeof body.url!=="string"||!/^\/api\/restaurant\/assets\/[a-f0-9-]{36}$/i.test(body.url))return fail("INVALID_IMAGE");const [assets]=await database().execute<RowDataPacket[]>("SELECT id FROM restaurant_assets WHERE tenant_id=? AND id=?",[ctx.tenantId,body.url.split('/').at(-1)!]);if(!assets.length)return fail("IMAGE_NOT_FOUND",404);existingImage=body.url;}
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  await db.execute("SELECT id FROM tenants WHERE id=? FOR UPDATE",[ctx.tenantId]);
  const [variants]=await db.execute<RowDataPacket[]>("SELECT id FROM catalog_variants WHERE tenant_id=? AND product_id=? AND id=? FOR UPDATE",[ctx.tenantId,body.product,body.variant]);
  if(!variants.length){await db.rollback();return fail("VARIANT_NOT_FOUND",404)}
  const [images]=await db.execute<RowDataPacket[]>("SELECT id,sort_order FROM catalog_variant_images WHERE tenant_id=? AND product_id=? AND variant_id=? ORDER BY sort_order,id FOR UPDATE",[ctx.tenantId,body.product,body.variant]);
  if(request.method==="POST"){
   if(images.length>=4){await db.rollback();return fail("IMAGE_LIMIT_REACHED",409)}
   let imageUrl=existingImage;const id=randomUUID();
   if(bytes){try{await assertTenantMediaSpace(db,ctx.tenantId,bytes.length);}catch(e){await db.rollback();return fail(e instanceof Error?e.message:"STORAGE_LIMIT_REACHED",409);}const asset=randomUUID();await db.execute("INSERT INTO restaurant_assets(id,tenant_id,mime_type,bytes,size_bytes) VALUES (?,?,?,?,?)",[asset,ctx.tenantId,mime,bytes,bytes.length]);imageUrl="/api/restaurant/assets/"+asset;}
   await db.execute("INSERT INTO catalog_variant_images(id,tenant_id,product_id,variant_id,image_url,sort_order) VALUES (?,?,?,?,?,?)",[id,ctx.tenantId,body.product,body.variant,imageUrl,images.length]);
   await db.commit();return NextResponse.json({ok:true,id},{status:201});
  }
  let order=images.map(i=>String(i.id));
  if(request.method==="DELETE"){
   if(!order.includes(String(body.id))){await db.rollback();return fail("IMAGE_NOT_FOUND",404)}
   await db.execute("DELETE FROM catalog_variant_images WHERE tenant_id=? AND product_id=? AND variant_id=? AND id=?",[ctx.tenantId,body.product,body.variant,String(body.id)]);
   order=order.filter(id=>id!==body!.id);
  }else{
   const ids=body.ids as string[];
   if(ids.length!==order.length||ids.some(id=>!order.includes(id))){await db.rollback();return fail("INVALID_ORDER")}
   order=ids;
  }
  for(let i=0;i<order.length;i++)await db.execute("UPDATE catalog_variant_images SET sort_order=? WHERE tenant_id=? AND product_id=? AND variant_id=? AND id=?",[i,ctx.tenantId,body.product,body.variant,order[i]]);
  await db.commit();return NextResponse.json({ok:true});
 }catch{await db.rollback();return fail("IMAGE_SAVE_FAILED",503)}finally{db.release()}
}
export const POST=mutate;
export const PATCH=mutate;
export const DELETE=mutate;

