import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
const events=["order_received","order_confirmed","order_ready","order_cancelled","reservation_created","reservation_cancelled","waitlist_joined","waiter_called","subscription_renewal"] as const;
async function auth(write:boolean){const user=await currentActiveAdminUserId();if(!user)return {status:401,user:null};try{await requirePlatformRole(user,write?["super_admin","admin"]:["super_admin","admin","support"]);return {status:200,user};}catch{return {status:403,user:null};}}
export async function GET(){
 const a=await auth(false);if(a.status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:a.status});
 try{const [rows]=await database().execute<RowDataPacket[]>("SELECT event_key,enabled,in_app_enabled,email_enabled,sound_enabled FROM platform_notification_rules");return NextResponse.json({ok:true,events, rules:rows});}
 catch{return NextResponse.json({ok:false,code:"NOTIFICATION_RULES_UNAVAILABLE"},{status:503});}
}
export async function PUT(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const a=await auth(true);if(a.status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:a.status});
 const b=await request.json().catch(()=>null);
 if(!b||!events.includes(b.event_key)||!["enabled","in_app_enabled","email_enabled","sound_enabled"].every(k=>typeof b[k]==="boolean"))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{await db.beginTransaction();await db.execute("INSERT INTO platform_notification_rules(event_key,enabled,in_app_enabled,email_enabled,sound_enabled,updated_by) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),in_app_enabled=VALUES(in_app_enabled),email_enabled=VALUES(email_enabled),sound_enabled=VALUES(sound_enabled),updated_by=VALUES(updated_by)",[b.event_key,b.enabled,b.in_app_enabled,b.email_enabled,b.sound_enabled,a.user]);await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id) VALUES (?,'platform.notification_rule.updated','notification_event',?)",[a.user,b.event_key]);await db.commit();return NextResponse.json({ok:true});}
 catch{await db.rollback();return NextResponse.json({ok:false,code:"NOTIFICATION_RULE_SAVE_FAILED"},{status:503});}finally{db.release();}
}
