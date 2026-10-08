import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
const keys=["site_name_ar","site_name_en","site_name_fr","support_email","contact_phone","default_locale"] as const;
async function authorize(write:boolean){const user=await currentActiveAdminUserId();if(!user)return {status:401,user:null};try{await requirePlatformRole(user,write?["super_admin","admin"]:["super_admin","admin","support"]);return {status:200,user};}catch{return {status:403,user:null};}}
export async function GET(){
 const auth=await authorize(false);if(auth.status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:auth.status});
 try{const [rows]=await database().execute<RowDataPacket[]>("SELECT config_key,config_value FROM platform_configuration");const values=Object.fromEntries(rows.map(r=>[r.config_key,r.config_value]));return NextResponse.json({ok:true,settings:values});}
 catch{return NextResponse.json({ok:false,code:"SETTINGS_UNAVAILABLE"},{status:503});}
}
export async function PUT(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const auth=await authorize(true);if(auth.status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:auth.status});
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=="object"||Array.isArray(body)||!keys.every(k=>typeof body[k]==="string"&&body[k].length<=200)||!["ar","en","fr"].includes(body.default_locale)||body.support_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.support_email))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{await db.beginTransaction();for(const key of keys){await db.execute("INSERT INTO platform_configuration(config_key,config_value,updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE config_value=VALUES(config_value),updated_by=VALUES(updated_by)",[key,body[key].trim(),auth.user]);}await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id) VALUES (?,'platform.settings.updated','platform','global')",[auth.user]);await db.commit();return NextResponse.json({ok:true});}
 catch{await db.rollback();return NextResponse.json({ok:false,code:"SETTINGS_SAVE_FAILED"},{status:503});}finally{db.release();}
}
