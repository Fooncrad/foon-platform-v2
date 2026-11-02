import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
import {requireAllAdditionalBranchesUnlocked} from "@/lib/restaurant/branch-pin";
import {PUBLIC_CONTROLS,normalizePublicControls,tenantPublicControls} from "@/lib/tenant/public-controls";
export const runtime="nodejs";
async function context(request:Request,write:boolean){
 const user=await currentUserId();if(!user)return {error:NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401})};
 const tenant=request.headers.get("x-foon-tenant")??"";
 try{const member=await requireTenantMembership(user,tenant,["owner","manager"],write);if(write)await requireAllAdditionalBranchesUnlocked(member.tenantId,user);return {tenantId:member.tenantId};}
 catch{return {error:NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})};}
}
export async function GET(request:Request){
 const ctx=await context(request,false);if(ctx.error)return ctx.error;
 try{
  const controls=await tenantPublicControls(ctx.tenantId!);
  const [rows]=await database().execute<RowDataPacket[]>("SELECT delivery_city,international_status,international_countries FROM tenant_public_controls WHERE tenant_id=? LIMIT 1",[ctx.tenantId]);
  const list=rows[0]?.international_countries;
  return NextResponse.json({ok:true,controls,deliveryCity:String(rows[0]?.delivery_city??""),internationalStatus:String(rows[0]?.international_status??"off"),internationalCountries:typeof list==="string"?JSON.parse(list):list??[]});
 }catch{return NextResponse.json({ok:false,code:"CONTROLS_UNAVAILABLE"},{status:503});}
}
export async function PUT(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const ctx=await context(request,true);if(ctx.error)return ctx.error;
 let body:unknown;try{body=await readLimitedJson(request,8192)}catch(error){const tooLarge=error instanceof Error&&error.message==="BATCH_TOO_LARGE";return NextResponse.json({ok:false,code:tooLarge?"BODY_TOO_LARGE":"INVALID_INPUT"},{status:tooLarge?413:400})}
 if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const data=body as Record<string,unknown>;
 const input=data.controls===undefined?{}:data.controls as Record<string,unknown>;
 if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(key=>!PUBLIC_CONTROLS.includes(key as typeof PUBLIC_CONTROLS[number])||typeof input[key]!=="boolean"))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 if(data.deliveryCity!==undefined&&(typeof data.deliveryCity!=="string"||data.deliveryCity.trim().length>120))return NextResponse.json({ok:false,code:"INVALID_CITY"},{status:400});
 if(data.requestInternational!==undefined&&typeof data.requestInternational!=="boolean")return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [profiles]=await db.execute<RowDataPacket[]>("SELECT activity_code FROM tenant_business_profiles WHERE tenant_id=? LIMIT 1",[ctx.tenantId]);
  const activity=String(profiles[0]?.activity_code??"");
  if(data.requestInternational===true&&["restaurant","cafe"].includes(activity)){await db.rollback();return NextResponse.json({ok:false,code:"INTERNATIONAL_NOT_ALLOWED"},{status:403});}
  const existing=await tenantPublicControls(ctx.tenantId!,db),controls=normalizePublicControls({...existing,...input});
  await db.execute("INSERT INTO tenant_public_controls(tenant_id,controls) VALUES (?,?) ON DUPLICATE KEY UPDATE controls=VALUES(controls)",[ctx.tenantId,JSON.stringify(controls)]);
  if(data.deliveryCity!==undefined)await db.execute("UPDATE tenant_public_controls SET delivery_city=? WHERE tenant_id=?",[data.deliveryCity.trim()||null,ctx.tenantId]);
  if(data.requestInternational===true)await db.execute("UPDATE tenant_public_controls SET international_status=IF(international_status='approved','approved','pending'),international_requested_at=UTC_TIMESTAMP() WHERE tenant_id=?",[ctx.tenantId]);
  if(data.requestInternational===false)await db.execute("UPDATE tenant_public_controls SET international_status='off',international_countries=NULL WHERE tenant_id=?",[ctx.tenantId]);
  await db.commit();
  return NextResponse.json({ok:true,controls});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"CONTROLS_SAVE_FAILED"},{status:503});}finally{db.release();}
}
