import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
export const runtime="nodejs";
const allowed=["classic","modern","minimal","sufra"];
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
 const [rows]=await database().execute<RowDataPacket[]>("SELECT template_key FROM restaurant_menu_appearance WHERE tenant_id=? LIMIT 1",[ctx.tenantId]);
 return NextResponse.json({ok:true,template:rows[0]?.template_key??"sufra"});
 }catch{return NextResponse.json({ok:false,code:"APPEARANCE_UNAVAILABLE"},{status:503})}
}
export async function PUT(request:Request){
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const ctx=await scope(request);if(ctx.error)return ctx.error;
 const body=await request.json().catch(()=>null);
 const template=body?.template;
 if(typeof template!=="string"||!allowed.includes(template))return NextResponse.json({ok:false,code:"INVALID_TEMPLATE"},{status:400});
 try{
 await database().execute("INSERT INTO restaurant_menu_appearance(tenant_id,template_key) VALUES (?,?) ON DUPLICATE KEY UPDATE template_key=VALUES(template_key)",[ctx.tenantId,template]);
 return NextResponse.json({ok:true,template});
 }catch{return NextResponse.json({ok:false,code:"APPEARANCE_SAVE_FAILED"},{status:503})}
}
