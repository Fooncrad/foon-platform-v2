import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
import {database} from "@/lib/db/mysql";
import {BranchPinError,requireAllAdditionalBranchesUnlocked} from "@/lib/restaurant/branch-pin";
import {defaultLocationSettings,parseLocationSettings} from "@/lib/tenant/free-location";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store"};
async function scope(request:Request,write:boolean){
 const user=await currentUserId();
 if(!user)return null;
 try{
  const member=await requireTenantMembership(user,request.headers.get("x-foon-tenant")??"",["owner","manager"],write);
  return {user,tenantId:member.tenantId};
 }catch{return null;}
}
const failed=(code:string,status:number)=>NextResponse.json({ok:false,code},{status,headers});
export async function GET(request:Request){
 const ctx=await scope(request,false);if(!ctx)return failed("FORBIDDEN",403);
 try{
  const [rows]=await database().execute<RowDataPacket[]>(
   "SELECT delivery_mode,latitude,longitude,radius_km,outside_message,google_analytics_id,facebook_pixel_id,ai_assistant_requested FROM tenant_location_settings WHERE tenant_id=? LIMIT 1",
   [ctx.tenantId]);
  const row=rows[0];
  const settings=row?{
   deliveryMode:row.delivery_mode,latitude:row.latitude===null?null:Number(row.latitude),
   longitude:row.longitude===null?null:Number(row.longitude),
   radiusKm:row.radius_km===null?null:Number(row.radius_km),
   outsideMessage:String(row.outside_message??""),
   googleAnalyticsId:String(row.google_analytics_id??""),
   facebookPixelId:String(row.facebook_pixel_id??""),
   aiAssistantRequested:Boolean(row.ai_assistant_requested)
  }:defaultLocationSettings;
  return NextResponse.json({ok:true,settings,mapProvider:"openstreetmap",freeGps:true},{headers});
 }catch{return failed("LOCATION_SETTINGS_UNAVAILABLE",503);}
}
export async function PUT(request:Request){
 try{assertSameOrigin(request);}catch{return failed("FORBIDDEN",403);}
 const ctx=await scope(request,true);if(!ctx)return failed("FORBIDDEN",403);
 let body:unknown;
 try{body=await readLimitedJson(request,4096);}
 catch(error){const oversized=error instanceof Error&&error.message==="BATCH_TOO_LARGE";return failed(oversized?"BODY_TOO_LARGE":"INVALID_INPUT",oversized?413:400);}
 const settings=parseLocationSettings(body);
 if(!settings)return failed("INVALID_LOCATION_SETTINGS",400);
 // Location, radius and analytics settings affect the entire business.
 // All additional branches require a valid session-bound PIN unlock.
 try{await requireAllAdditionalBranchesUnlocked(ctx.tenantId,ctx.user);}
 catch(error){
  if(error instanceof BranchPinError)return failed(error.code,error.code==="BRANCH_PIN_SETUP_REQUIRED"?409:403);
  return failed("BRANCH_PIN_UNAVAILABLE",503);
 }
 try{
  const db=database();
  await db.execute(
   "INSERT INTO tenant_location_settings (tenant_id,delivery_mode,latitude,longitude,radius_km,outside_message,google_analytics_id,facebook_pixel_id,ai_assistant_requested) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE delivery_mode=VALUES(delivery_mode),latitude=VALUES(latitude),longitude=VALUES(longitude),radius_km=VALUES(radius_km),outside_message=VALUES(outside_message),google_analytics_id=VALUES(google_analytics_id),facebook_pixel_id=VALUES(facebook_pixel_id),ai_assistant_requested=VALUES(ai_assistant_requested)",
   [ctx.tenantId,settings.deliveryMode,settings.latitude,settings.longitude,settings.radiusKm,
    settings.outsideMessage||null,settings.googleAnalyticsId||null,
    settings.facebookPixelId||null,settings.aiAssistantRequested?1:0]);
  return NextResponse.json({ok:true,settings},{headers});
 }catch{return failed("LOCATION_SETTINGS_SAVE_FAILED",503);}
}
