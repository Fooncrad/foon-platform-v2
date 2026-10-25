import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {requireAllAdditionalBranchesUnlocked} from "@/lib/restaurant/branch-pin";
import {assertSameOrigin} from "@/lib/security/origin";
import {tenantEntitlement} from "@/lib/plans/entitlements";

export const runtime="nodejs";
const uuid=/^[a-f0-9-]{36}$/i;
const assetUrl=/^\/api\/restaurant\/assets\/([a-f0-9-]{36})$/i;
const fail=(code:string,status=400)=>NextResponse.json({ok:false,code},{status,headers:{"Cache-Control":"no-store"}});

async function scope(request:Request){
 const user=await currentUserId(),tenant=request.headers.get("x-foon-tenant");
 if(!user||!tenant)return null;
 try{
  const access=await requireTenantMembership(user,tenant,["owner","manager"],request.method!=="GET");
  if(request.method!=="GET")await requireAllAdditionalBranchesUnlocked(access.tenantId,user);
  const [rows]=await database().execute<RowDataPacket[]>("SELECT kind FROM tenants WHERE id=? AND status='active' LIMIT 1",[access.tenantId]);
  if(rows[0]?.kind!=="restaurant")return null;
  return {tenantId:access.tenantId,user};
 }catch{return null;}
}
/** One gallery of at most four images shared across ar/en/fr. The first image
 * is mirrored to restaurant_menu_items.image_url for older storefront readers.
 * A legacy cover without a gallery row is backfilled before the first add.
 */
export async function GET(request:Request){
 const ctx=await scope(request);if(!ctx)return fail("FORBIDDEN",403);
 const item=new URL(request.url).searchParams.get("item");
 if(!item||!uuid.test(item))return fail("INVALID_ITEM");
 try{
  const [[rows],[images]]=await Promise.all([
   database().execute<RowDataPacket[]>("SELECT image_url FROM restaurant_menu_items WHERE tenant_id=? AND id=?",[ctx.tenantId,item]),
   database().execute<RowDataPacket[]>("SELECT id,image_url,sort_order FROM restaurant_menu_item_images WHERE tenant_id=? AND item_id=? ORDER BY sort_order,id",[ctx.tenantId,item])
  ]);
  if(!rows.length)return fail("ITEM_NOT_FOUND",404);
  return NextResponse.json({ok:true,images,legacyCover:images.length?null:rows[0].image_url??null},{headers:{"Cache-Control":"no-store"}});
 }catch{return fail("IMAGES_UNAVAILABLE",503);}
}
async function mutate(request:Request){
 try{assertSameOrigin(request);}catch{return fail("FORBIDDEN",403);}
 const ctx=await scope(request);if(!ctx)return fail("FORBIDDEN",403);
 if(!(await tenantEntitlement(ctx.tenantId,"digital_menu")).enabled)return fail("PLAN_FEATURE_REQUIRED",403);
 const body=await request.json().catch(()=>null) as {item?:unknown;url?:unknown;ids?:unknown;id?:unknown}|null;
 if(!body||typeof body.item!=="string"||!uuid.test(body.item))return fail("INVALID_ITEM");
 let assetId:string|null=null;
 if(request.method==="POST"){
  if(typeof body.url!=="string")return fail("IMAGE_REQUIRED");
  const matched=body.url.match(assetUrl);
  if(!matched)return fail("IMAGE_FROM_LIBRARY_REQUIRED");
  assetId=matched[1];
 }
 if(request.method==="PATCH"&&(!Array.isArray(body.ids)||body.ids.length>4||new Set(body.ids).size!==body.ids.length||body.ids.some(x=>typeof x!=="string"||!uuid.test(x))))return fail("INVALID_IMAGE_ORDER");
 if(request.method==="DELETE"&&(typeof body.id!=="string"||!uuid.test(body.id)))return fail("INVALID_IMAGE");
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  // Serialize all gallery writers for a tenant, including asset uploads.
  await db.execute("SELECT id FROM tenants WHERE id=? FOR UPDATE",[ctx.tenantId]);
  const [itemRows]=await db.execute<RowDataPacket[]>("SELECT image_url FROM restaurant_menu_items WHERE tenant_id=? AND id=? FOR UPDATE",[ctx.tenantId,body.item]);
  if(!itemRows.length){await db.rollback();return fail("ITEM_NOT_FOUND",404);}
  if(assetId){
   const [assets]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_assets WHERE tenant_id=? AND id=? LIMIT 1",[ctx.tenantId,assetId]);
   if(!assets.length){await db.rollback();return fail("IMAGE_NOT_FOUND",404);}
  }
  let [images]=await db.execute<RowDataPacket[]>("SELECT id,image_url,sort_order FROM restaurant_menu_item_images WHERE tenant_id=? AND item_id=? ORDER BY sort_order,id FOR UPDATE",[ctx.tenantId,body.item]);
  if(request.method==="POST"&&!images.length&&typeof itemRows[0].image_url==="string"&&itemRows[0].image_url){
   const legacyId=randomUUID();
   await db.execute("INSERT INTO restaurant_menu_item_images(id,tenant_id,item_id,image_url,sort_order) VALUES (?,?,?,?,0)",[legacyId,ctx.tenantId,body.item,itemRows[0].image_url]);
   images=[{id:legacyId,image_url:itemRows[0].image_url,sort_order:0} as RowDataPacket];
  }
  let order=images.map(row=>String(row.id));
  if(request.method==="POST"){
   if(order.length>=4){await db.rollback();return fail("IMAGE_LIMIT_REACHED",409);}
   const id=randomUUID();
   await db.execute("INSERT INTO restaurant_menu_item_images(id,tenant_id,item_id,image_url,sort_order) VALUES (?,?,?,?,?)",[id,ctx.tenantId,body.item,String(body.url),order.length]);
   order.push(id);
  }else if(request.method==="DELETE"){
   if(!order.includes(String(body.id))){await db.rollback();return fail("IMAGE_NOT_FOUND",404);}
   await db.execute("DELETE FROM restaurant_menu_item_images WHERE tenant_id=? AND item_id=? AND id=?",[ctx.tenantId,body.item,String(body.id)]);
   order=order.filter(id=>id!==body.id);
  }else{
   const ids=body.ids as string[];
   if(ids.length!==order.length||ids.some(id=>!order.includes(id))){await db.rollback();return fail("INVALID_IMAGE_ORDER");}
   order=ids;
  }
  for(let i=0;i<order.length;i++)await db.execute("UPDATE restaurant_menu_item_images SET sort_order=? WHERE tenant_id=? AND item_id=? AND id=?",[i,ctx.tenantId,body.item,order[i]]);
  const [first]=order.length?await db.execute<RowDataPacket[]>("SELECT image_url FROM restaurant_menu_item_images WHERE tenant_id=? AND item_id=? AND id=?",[ctx.tenantId,body.item,order[0]]):[[]];
  await db.execute("UPDATE restaurant_menu_items SET image_url=? WHERE tenant_id=? AND id=?",[first[0]?.image_url??null,ctx.tenantId,body.item]);
  await db.execute("INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id,metadata) VALUES (?,?,?,?,?)",[ctx.tenantId,ctx.user,"menu.images."+request.method.toLowerCase(),body.item,JSON.stringify({count:order.length})]);
  await db.commit();
  return NextResponse.json({ok:true,count:order.length},{headers:{"Cache-Control":"no-store"}});
 }catch{await db.rollback();return fail("IMAGE_SAVE_FAILED",503);}
 finally{db.release();}
}
export const POST=mutate;
export const PATCH=mutate;
export const DELETE=mutate;
