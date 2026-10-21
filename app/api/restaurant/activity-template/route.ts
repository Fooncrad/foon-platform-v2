import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {requireAllAdditionalBranchesUnlocked} from "@/lib/restaurant/branch-pin";
import {defaultTemplateForActivity,isTemplateForActivity,templatesForActivity} from "@/lib/platform/activity-templates";
export const runtime="nodejs";
async function context(request:Request,write:boolean){
 const userId=await currentUserId();
 if(!userId)return {error:NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401})};
 const tenant=request.headers.get("x-foon-tenant");
 if(!tenant)return {error:NextResponse.json({ok:false,code:"TENANT_CONTEXT_REQUIRED"},{status:400})};
 try{
  const member=await requireTenantMembership(userId,tenant,["owner","manager"],write);
  if(write)await requireAllAdditionalBranchesUnlocked(member.tenantId,userId);
  const [rows]=await database().execute<RowDataPacket[]>("SELECT activity_code FROM tenant_business_profiles WHERE tenant_id=? LIMIT 1",[member.tenantId]);
  const activity=String(rows[0]?.activity_code??"");
  if(!templatesForActivity(activity).length)return {error:NextResponse.json({ok:false,code:"ACTIVITY_NOT_CONFIGURED"},{status:409})};
  return {tenantId:member.tenantId,activity};
 }catch{return {error:NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}}
}
export async function GET(request:Request){
 const ctx=await context(request,false);if(ctx.error)return ctx.error;
 try{
  const [rows]=await database().execute<RowDataPacket[]>("SELECT template_key FROM activity_storefront_templates WHERE tenant_id=? LIMIT 1",[ctx.tenantId]);
  const stored=String(rows[0]?.template_key??"");
  return NextResponse.json({ok:true,activity:ctx.activity,templates:templatesForActivity(ctx.activity!),template:isTemplateForActivity(ctx.activity!,stored)?stored:defaultTemplateForActivity(ctx.activity!)});
 }catch{return NextResponse.json({ok:false,code:"TEMPLATES_UNAVAILABLE"},{status:503})}
}
export async function PUT(request:Request){
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const ctx=await context(request,true);if(ctx.error)return ctx.error;
 const body=await request.json().catch(()=>null);
 const template=body?.template;
 if(typeof template!=="string"||!isTemplateForActivity(ctx.activity!,template))return NextResponse.json({ok:false,code:"INVALID_ACTIVITY_TEMPLATE"},{status:400});
 try{
  await database().execute("INSERT INTO activity_storefront_templates(tenant_id,template_key) VALUES (?,?) ON DUPLICATE KEY UPDATE template_key=VALUES(template_key)",[ctx.tenantId,template]);
  return NextResponse.json({ok:true,template});
 }catch{return NextResponse.json({ok:false,code:"TEMPLATE_SAVE_FAILED"},{status:503})}
}
