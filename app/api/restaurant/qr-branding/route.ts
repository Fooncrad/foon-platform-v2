import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {requireAllAdditionalBranchesUnlocked} from "@/lib/restaurant/branch-pin";
import {defaultQrBranding,parseQrBranding} from "@/lib/platform/qr-branding";
export const dynamic="force-dynamic";
async function context(req:Request,write:boolean){
 const user=await currentUserId();if(!user)return {error:NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401})};
 const tenant=req.headers.get("x-foon-tenant");if(!tenant)return {error:NextResponse.json({ok:false,code:"TENANT_REQUIRED"},{status:400})};
 try{const member=await requireTenantMembership(user,tenant,["owner","manager"],write);if(write)await requireAllAdditionalBranchesUnlocked(member.tenantId,user);return {tenantId:member.tenantId};}
 catch{return {error:NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}}
}
export async function GET(req:Request){const ctx=await context(req,false);if(ctx.error)return ctx.error;try{const [rows]=await database().execute<RowDataPacket[]>("SELECT settings FROM tenant_qr_branding WHERE tenant_id=? LIMIT 1",[ctx.tenantId]);const raw=rows[0]?.settings;return NextResponse.json({ok:true,settings:parseQrBranding(typeof raw==="string"?JSON.parse(raw):raw)??defaultQrBranding},{headers:{"Cache-Control":"no-store"}});}catch{return NextResponse.json({ok:false,code:"QR_SETTINGS_UNAVAILABLE"},{status:503})}}
export async function PUT(req:Request){try{assertSameOrigin(req)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}const ctx=await context(req,true);if(ctx.error)return ctx.error;const data=await req.json().catch(()=>null);const settings=parseQrBranding(data?.settings);if(!settings)return NextResponse.json({ok:false,code:"INVALID_QR_SETTINGS"},{status:400});try{await database().execute("INSERT INTO tenant_qr_branding(tenant_id,settings) VALUES (?,?) ON DUPLICATE KEY UPDATE settings=VALUES(settings)",[ctx.tenantId,JSON.stringify(settings)]);return NextResponse.json({ok:true,settings});}catch{return NextResponse.json({ok:false,code:"QR_SETTINGS_SAVE_FAILED"},{status:503})}}
