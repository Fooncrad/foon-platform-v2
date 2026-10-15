import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {tenantEntitlement} from "@/lib/plans/entitlements";
export const runtime="nodejs";
async function authorize(request:Request){
 const user=await currentUserId(),tenant=request.headers.get("x-foon-tenant");
 if(!user||!tenant)return null;
 try{return {...await requireTenantMembership(user,tenant,["owner","manager"],request.method!=="GET"),user};}catch{return null;}
}
const failure=(code:string,status=400)=>NextResponse.json({ok:false,code},{status});
export async function GET(request:Request){
 const ctx=await authorize(request);if(!ctx)return failure("FORBIDDEN",403);
 const product=new URL(request.url).searchParams.get("product");
 if(!product)return failure("PRODUCT_REQUIRED");
 try{
  const [products]=await database().execute<RowDataPacket[]>("SELECT id FROM catalog_products WHERE tenant_id=? AND id=?",[ctx.tenantId,product]);
  if(!products.length)return failure("PRODUCT_NOT_FOUND",404);
  const [images]=await database().execute<RowDataPacket[]>("SELECT id,image_url,alt_ar,sort_order FROM catalog_images WHERE tenant_id=? AND product_id=? ORDER BY sort_order,id",[ctx.tenantId,product]);
  return NextResponse.json({ok:true,images});
 }catch{return failure("IMAGES_UNAVAILABLE",503);}
}
async function mutate(request:Request){
 try{assertSameOrigin(request);}catch{return failure("FORBIDDEN",403);}
 const ctx=await authorize(request);if(!ctx)return failure("FORBIDDEN",403);
 if(!(await tenantEntitlement(ctx.tenantId,"digital_menu")).enabled)return failure("PLAN_FEATURE_REQUIRED",403);
 if(Number(request.headers.get("content-length")??0)>3*1024*1024)return failure("IMAGE_TOO_LARGE",413);
 let body:Record<string,unknown>|null=null,bytes:Buffer|null=null,mime:string|null=null;
 if(request.method==="POST"&&request.headers.get("content-type")?.startsWith("multipart/form-data")){
  const form=await request.formData().catch(()=>null),file=form?.get("file");
  if(!(file instanceof File)||!file.size||file.size>2*1024*1024)return failure("INVALID_IMAGE");
  bytes=Buffer.from(await file.arrayBuffer());
  mime=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?"image/png":bytes[0]===255&&bytes[1]===216&&bytes[2]===255?"image/jpeg":bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP"?"image/webp":null;
  if(!mime||file.type!==mime)return failure("INVALID_IMAGE");
  body={product:form?.get("product"),alt:form?.get("alt")};
 }else body=await request.json().catch(()=>null);
 if(request.method==="DELETE"&&body&&body.product===undefined&&typeof body.id==="string"){
  const [matches]=await database().execute<RowDataPacket[]>("SELECT product_id FROM catalog_images WHERE tenant_id=? AND id=?",[ctx.tenantId,body.id]);
  if(!matches.length)return failure("IMAGE_NOT_FOUND",404);
  body.product=String(matches[0].product_id);
 }
 if(!body||typeof body.product!=="string"||body.product.length!==36)return failure("INVALID_INPUT");
 let imageUrl="";
 if(request.method==="POST"&&!bytes){
  if(typeof body.url!=="string"||body.url.length>1024)return failure("INVALID_INPUT");
  let url:URL;try{url=new URL(body.url);}catch{return failure("INVALID_URL");}
  if(url.protocol!=="https:"||url.username||url.password)return failure("HTTPS_IMAGE_REQUIRED");
  imageUrl=url.toString();
 }
 if(request.method==="PATCH"&&(!Array.isArray(body.ids)||body.ids.some(id=>typeof id!=="string")||new Set(body.ids).size!==body.ids.length))return failure("INVALID_IMAGE_ORDER");
 if(request.method==="DELETE"&&typeof body.id!=="string")return failure("INVALID_INPUT");
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  // Same tenant-first lock as asset uploads: serializes storage quota and image cap.
  await db.execute("SELECT id FROM tenants WHERE id=? FOR UPDATE",[ctx.tenantId]);
  const [products]=await db.execute<RowDataPacket[]>("SELECT id FROM catalog_products WHERE tenant_id=? AND id=? FOR UPDATE",[ctx.tenantId,body.product]);
  if(!products.length){await db.rollback();return failure("PRODUCT_NOT_FOUND",404);}
  const [images]=await db.execute<RowDataPacket[]>("SELECT id FROM catalog_images WHERE tenant_id=? AND product_id=? ORDER BY sort_order,id FOR UPDATE",[ctx.tenantId,body.product]);
  if(request.method==="POST"){
   if(images.length>=4){await db.rollback();return failure("IMAGE_LIMIT_REACHED",409);}
   if(bytes&&mime){
    const [[used]]=await db.execute<RowDataPacket[]>("SELECT COALESCE(SUM(size_bytes),0) AS total FROM restaurant_assets WHERE tenant_id=?",[ctx.tenantId]);
    if(Number(used.total)+bytes.length>50*1024*1024){await db.rollback();return failure("IMAGE_STORAGE_LIMIT",409);}
    const asset=randomUUID();await db.execute("INSERT INTO restaurant_assets(id,tenant_id,mime_type,bytes,size_bytes) VALUES (?,?,?,?,?)",[asset,ctx.tenantId,mime,bytes,bytes.length]);
    imageUrl="/api/restaurant/assets/"+asset;
    await db.execute("INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id,metadata) VALUES (?,?,'asset.upload',?,?)",[ctx.tenantId,ctx.user,asset,JSON.stringify({mime,size:bytes.length,product:body.product})]);
   }
   const id=randomUUID();
   await db.execute("INSERT INTO catalog_images(id,tenant_id,product_id,image_url,alt_ar,sort_order) VALUES (?,?,?,?,?,?)",[id,ctx.tenantId,body.product,imageUrl,typeof body.alt==="string"?body.alt.slice(0,250):null,images.length]);
   await db.commit();return NextResponse.json({ok:true,id},{status:201});
  }
  let ordered=images.map(i=>String(i.id));
  if(request.method==="DELETE"){
   if(!ordered.includes(String(body.id))){await db.rollback();return failure("IMAGE_NOT_FOUND",404);}
   await db.execute("DELETE FROM catalog_images WHERE tenant_id=? AND product_id=? AND id=?",[ctx.tenantId,body.product,String(body.id)]);
   ordered=ordered.filter(id=>id!==body.id);
  }else{
   const ids=body.ids as string[];
   if(ids.length!==ordered.length||ids.some(id=>!ordered.includes(id))){await db.rollback();return failure("INVALID_IMAGE_ORDER");}
   ordered=ids;
  }
  for(let index=0;index<ordered.length;index++)await db.execute("UPDATE catalog_images SET sort_order=? WHERE tenant_id=? AND product_id=? AND id=?",[index,ctx.tenantId,body.product,ordered[index]]);
  await db.commit();return NextResponse.json({ok:true,deleted:request.method==="DELETE"?1:undefined});
 }catch{await db.rollback();return failure("IMAGE_SAVE_FAILED",503);}finally{db.release();}
}
export const POST=mutate;
export const PATCH=mutate;
export const DELETE=mutate;
