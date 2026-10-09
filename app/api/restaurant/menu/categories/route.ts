import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
export const runtime="nodejs";
async function scope(request:Request){
 const userId=await currentUserId();
 if(!userId)return {error:NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401})};
 const tenant=request.headers.get("x-foon-tenant");
 if(!tenant)return {error:NextResponse.json({ok:false,code:"TENANT_CONTEXT_REQUIRED"},{status:400})};
 try{
 const ctx=await requireTenantMembership(userId,tenant,["owner","manager"]);
 const [rows]=await database().execute<RowDataPacket[]>("SELECT kind FROM tenants WHERE id=? AND status='active' LIMIT 1",[ctx.tenantId]);
 if(rows[0]?.kind!=="restaurant")return {error:NextResponse.json({ok:false,code:"RESTAURANT_ONLY"},{status:403})};
 return {tenantId:ctx.tenantId};
 }catch{return {error:NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}}
}
export async function GET(request:Request){
 const ctx=await scope(request);if(ctx.error)return ctx.error;
 try{
 const [categories]=await database().execute<RowDataPacket[]>("SELECT id,name,sort_order,enabled FROM restaurant_menu_categories WHERE tenant_id=? ORDER BY sort_order,name",[ctx.tenantId]);
 return NextResponse.json({ok:true,categories});
 }catch{return NextResponse.json({ok:false,code:"MENU_UNAVAILABLE"},{status:503})}
}
export async function POST(request:Request){
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const ctx=await scope(request);if(ctx.error)return ctx.error;
 const body=await request.json().catch(()=>null);
 const name=typeof body?.name==="string"?body.name.trim():"";
 if(!name||name.length>180)return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{
 const id=randomUUID();
 await database().execute("INSERT INTO restaurant_menu_categories(id,tenant_id,name) VALUES (?,?,?)",[id,ctx.tenantId,name]);
 return NextResponse.json({ok:true,category:{id,name,enabled:true}},{status:201});
 }catch{return NextResponse.json({ok:false,code:"MENU_SAVE_FAILED"},{status:503})}
}
