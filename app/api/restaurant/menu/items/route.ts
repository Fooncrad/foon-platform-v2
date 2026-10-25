import {assertCatalogCapacity} from "@/lib/plans/catalog-capacity";
import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {requireAllAdditionalBranchesUnlocked} from "@/lib/restaurant/branch-pin";
export const runtime="nodejs";
async function authorize(request:Request){
 const id=await currentUserId();
 if(!id)return {error:NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401})};
 const tenant=request.headers.get("x-foon-tenant");
 if(!tenant)return {error:NextResponse.json({ok:false,code:"TENANT_CONTEXT_REQUIRED"},{status:400})};
 try{
 const ctx=await requireTenantMembership(id,tenant,["owner","manager"],request.method!=="GET");
 if(request.method!=="GET")await requireAllAdditionalBranchesUnlocked(ctx.tenantId,id);
 const [rows]=await database().execute<RowDataPacket[]>("SELECT kind FROM tenants WHERE id=? AND status='active' LIMIT 1",[ctx.tenantId]);
 if(rows[0]?.kind!=="restaurant")return {error:NextResponse.json({ok:false,code:"RESTAURANT_ONLY"},{status:403})};
 return {tenantId:ctx.tenantId};
 }catch{return {error:NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}}
}
export async function GET(request:Request){
 const auth=await authorize(request);if(auth.error)return auth.error;
 try{
 const [items]=await database().execute<RowDataPacket[]>("SELECT i.id,i.category_id,i.name,i.description,i.price,i.currency,i.enabled,i.image_url AS imageUrl,COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.nameEn')),'') AS nameEn,COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.nameFr')),'') AS nameFr FROM restaurant_menu_items i LEFT JOIN restaurant_resources r ON r.id=i.id AND r.tenant_id=i.tenant_id AND r.kind='menu_item' WHERE i.tenant_id=? ORDER BY i.sort_order,i.name LIMIT 500",[auth.tenantId]);
 return NextResponse.json({ok:true,items});
 }catch{return NextResponse.json({ok:false,code:"MENU_UNAVAILABLE"},{status:503})}
}
export async function POST(request:Request){
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const auth=await authorize(request);if(auth.error)return auth.error;
 const body=await request.json().catch(()=>null);
 const name=typeof body?.name==="string"?body.name.trim():"";
 const description=typeof body?.description==="string"?body.description.trim():"";
 const categoryId=typeof body?.categoryId==="string"?body.categoryId:"";
 const nameEn=typeof body?.nameEn==="string"?body.nameEn.trim():"",nameFr=typeof body?.nameFr==="string"?body.nameFr.trim():"";
 const price=body?.price;
 const priceText=typeof price==="string"?price:typeof price==="number"?String(price):"";
 if(!name||name.length>180||nameEn.length>180||nameFr.length>180||description.length>5000||!/^[0-9]{1,10}(\.[0-9]{1,2})?$/.test(priceText)||Number(priceText)>9999999999.99||!/^[a-f0-9-]{36}$/i.test(categoryId))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{
 const [categories]=await database().execute<RowDataPacket[]>("SELECT id FROM restaurant_menu_categories WHERE id=? AND tenant_id=? AND enabled=1 LIMIT 1",[categoryId,auth.tenantId]);
 if(!categories.length)return NextResponse.json({ok:false,code:"CATEGORY_NOT_FOUND"},{status:404});
 const id=randomUUID();
 const connection=await database().getConnection();
 try{
  await connection.beginTransaction();
  await assertCatalogCapacity(connection,auth.tenantId!,true,"product");
  await connection.execute("INSERT INTO restaurant_menu_items(id,tenant_id,category_id,name,description,price,currency) VALUES (?,?,?,?,?,?,'SAR')",[id,auth.tenantId,categoryId,name,description||null,priceText]);
  await connection.execute("INSERT INTO restaurant_resources(id,tenant_id,branch_id,kind,name,status,data) VALUES (?,?,NULL,'menu_item',?,'active',JSON_OBJECT('categoryId',?,'nameEn',?,'nameFr',?))",[id,auth.tenantId,name,categoryId,nameEn,nameFr]);
  await connection.commit();
 }catch(error){await connection.rollback();throw error}finally{connection.release()}
 return NextResponse.json({ok:true,item:{id,name,categoryId,price:priceText}},{status:201});
 }catch(e){const code=e instanceof Error?e.message:"";return NextResponse.json({ok:false,code:["PLAN_LIMIT_REACHED","PLAN_FEATURE_REQUIRED"].includes(code)?code:"MENU_SAVE_FAILED"},{status:["PLAN_LIMIT_REACHED","PLAN_FEATURE_REQUIRED"].includes(code)?403:503});}
}
