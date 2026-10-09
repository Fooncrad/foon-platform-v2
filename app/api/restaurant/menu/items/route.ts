import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
export const runtime="nodejs";
async function authorize(request:Request){
 const id=await currentUserId();
 if(!id)return {error:NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401})};
 const tenant=request.headers.get("x-foon-tenant");
 if(!tenant)return {error:NextResponse.json({ok:false,code:"TENANT_CONTEXT_REQUIRED"},{status:400})};
 try{
 const ctx=await requireTenantMembership(id,tenant,["owner","manager"]);
 const [rows]=await database().execute<RowDataPacket[]>("SELECT kind FROM tenants WHERE id=? AND status='active' LIMIT 1",[ctx.tenantId]);
 if(rows[0]?.kind!=="restaurant")return {error:NextResponse.json({ok:false,code:"RESTAURANT_ONLY"},{status:403})};
 return {tenantId:ctx.tenantId};
 }catch{return {error:NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}}
}
export async function GET(request:Request){
 const auth=await authorize(request);if(auth.error)return auth.error;
 try{
 const [items]=await database().execute<RowDataPacket[]>("SELECT id,category_id,name,description,price,currency,enabled FROM restaurant_menu_items WHERE tenant_id=? ORDER BY sort_order,name LIMIT 500",[auth.tenantId]);
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
 const price=body?.price;
 const priceText=typeof price==="string"?price:typeof price==="number"?String(price):"";
 if(!name||name.length>180||description.length>5000||!/^[0-9]{1,10}(\.[0-9]{1,2})?$/.test(priceText)||Number(priceText)>9999999999.99||!/^[a-f0-9-]{36}$/i.test(categoryId))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{
 const [categories]=await database().execute<RowDataPacket[]>("SELECT id FROM restaurant_menu_categories WHERE id=? AND tenant_id=? AND enabled=1 LIMIT 1",[categoryId,auth.tenantId]);
 if(!categories.length)return NextResponse.json({ok:false,code:"CATEGORY_NOT_FOUND"},{status:404});
 const id=randomUUID();
 await database().execute("INSERT INTO restaurant_menu_items(id,tenant_id,category_id,name,description,price,currency) VALUES (?,?,?,?,?,?,'SAR')",[id,auth.tenantId,categoryId,name,description||null,priceText]);
 return NextResponse.json({ok:true,item:{id,name,categoryId,price:priceText}},{status:201});
 }catch{return NextResponse.json({ok:false,code:"MENU_SAVE_FAILED"},{status:503})}
}
