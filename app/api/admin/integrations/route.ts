import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
export const runtime="nodejs";
const keys=["recaptcha_site_key","recaptcha_requested","ai_provider","ai_model","tracking_consent_required","google_oauth_enabled"] as const;
const headers={"Cache-Control":"private, no-store"};
async function access(write:boolean){
 const user=await currentActiveAdminUserId();if(!user)return null;
 try{await requirePlatformRole(user,write?["super_admin","admin"]:["super_admin","admin","support"]);return user;}
 catch{return null;}
}
const error=(code:string,status:number)=>NextResponse.json({ok:false,code},{status,headers});
export async function GET(){
 const user=await access(false);if(!user)return error("FORBIDDEN",403);
 try{
  const [rows]=await database().execute<RowDataPacket[]>(
   "SELECT config_key,config_value FROM platform_configuration WHERE config_key IN (?,?,?,?,?,?)",
   [...keys]);
  const raw=Object.fromEntries(rows.map(r=>[String(r.config_key),String(r.config_value)]));
  const [locations]=await database().execute<RowDataPacket[]>("SELECT COUNT(*) AS configured,SUM(delivery_mode='radius') AS radius_enabled FROM tenant_location_settings");
  return NextResponse.json({ok:true,configuration:{
   recaptchaSiteKey:raw.recaptcha_site_key??"",recaptchaRequested:raw.recaptcha_requested==="true",
   aiProvider:raw.ai_provider??"off",aiModel:raw.ai_model??"",
   trackingConsentRequired:raw.tracking_consent_required!=="false",
   googleOauthEnabled:raw.google_oauth_enabled!=="false"
  },environment:{
   recaptchaSecretPresent:Boolean(process.env.RECAPTCHA_SECRET_KEY),
   aiKeyPresent:Boolean(process.env.OPENAI_API_KEY),
   googleClientIdPresent:Boolean(process.env.GOOGLE_CLIENT_ID),
   googleClientSecretPresent:Boolean(process.env.GOOGLE_CLIENT_SECRET),
   googleAppUrlPresent:Boolean(process.env.APP_URL)
  },googleCallbackUrl:(()=>{try{const u=new URL(process.env.APP_URL??"");return u.protocol==="https:"?new URL("/api/auth/google/callback",u).toString():"";}catch{return "";}})(),locationSummary:{configured:Number(locations[0]?.configured??0),radiusEnabled:Number(locations[0]?.radius_enabled??0)},integrationActive:false},{headers});
 }catch{return error("INTEGRATIONS_UNAVAILABLE",503);}
}
export async function PUT(request:Request){
 try{assertSameOrigin(request);}catch{return error("FORBIDDEN",403);}
 const user=await access(true);if(!user)return error("FORBIDDEN",403);
 const b=await request.json().catch(()=>null);
 if(!b||typeof b!=="object"||Array.isArray(b)
  ||typeof b.recaptchaSiteKey!=="string"
  ||(b.recaptchaSiteKey!==""&&!/^[A-Za-z0-9_-]{20,200}$/.test(b.recaptchaSiteKey))
  ||typeof b.recaptchaRequested!=="boolean"
  ||!["off","openai","other"].includes(b.aiProvider)
  ||typeof b.aiModel!=="string"||b.aiModel.length>80||!/^[A-Za-z0-9._:-]*$/.test(b.aiModel)
  ||typeof b.trackingConsentRequired!=="boolean"
  ||typeof b.googleOauthEnabled!=="boolean")return error("INVALID_INTEGRATION_SETTINGS",400);
 const vals=[b.recaptchaSiteKey,b.recaptchaRequested?"true":"false",b.aiProvider,b.aiModel,b.trackingConsentRequired?"true":"false",b.googleOauthEnabled?"true":"false"];
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  for(let i=0;i<keys.length;i++)await db.execute(
   "INSERT INTO platform_configuration(config_key,config_value,updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE config_value=VALUES(config_value),updated_by=VALUES(updated_by)",
   [keys[i],vals[i],user]);
  await db.execute(
   "INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id) VALUES (?,'platform.integrations.updated','platform','global')",
   [user]);
  await db.commit();
  return NextResponse.json({ok:true,integrationActive:false},{headers});
 }catch{await db.rollback();return error("INTEGRATIONS_SAVE_FAILED",503);}
 finally{db.release();}
}
