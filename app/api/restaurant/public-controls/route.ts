import {NextResponse} from "next/server";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {PUBLIC_CONTROLS,normalizePublicControls,tenantPublicControls} from "@/lib/tenant/public-controls";
export const runtime="nodejs";
async function context(request:Request,write:boolean){
 const user=await currentUserId();if(!user)return {error:NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401})};
 const tenant=request.headers.get("x-foon-tenant")??"";
 try{const member=await requireTenantMembership(user,tenant,["owner","manager"],write);return {tenantId:member.tenantId};}
 catch{return {error:NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})};}
}
export async function GET(request:Request){
 const ctx=await context(request,false);if(ctx.error)return ctx.error;
 try{return NextResponse.json({ok:true,controls:await tenantPublicControls(ctx.tenantId!)});}
 catch{return NextResponse.json({ok:false,code:"CONTROLS_UNAVAILABLE"},{status:503});}
}
export async function PUT(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const ctx=await context(request,true);if(ctx.error)return ctx.error;
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=="object"||Array.isArray(body)||!body.controls||typeof body.controls!=="object"||Array.isArray(body.controls))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const input=body.controls as Record<string,unknown>;
 if(Object.keys(input).some(key=>!PUBLIC_CONTROLS.includes(key as typeof PUBLIC_CONTROLS[number])||typeof input[key]!=="boolean"))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{
  const db=database(),old=await tenantPublicControls(ctx.tenantId!);
  const controls=normalizePublicControls({...old,...input});
  await db.execute("INSERT INTO tenant_public_controls(tenant_id,controls) VALUES (?,?) ON DUPLICATE KEY UPDATE controls=VALUES(controls)",[ctx.tenantId,JSON.stringify(controls)]);
  return NextResponse.json({ok:true,controls});
 }catch{return NextResponse.json({ok:false,code:"CONTROLS_SAVE_FAILED"},{status:503});}
}
