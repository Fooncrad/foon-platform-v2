import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
async function authorize(write:boolean){const id=await currentActiveAdminUserId();if(!id)return {status:401,id:null};try{await requirePlatformRole(id,write?["super_admin","admin"]:["super_admin","admin","support"]);return {status:200,id};}catch{return {status:403,id:null};}}
export async function GET(){
 const auth=await authorize(false);if(auth.status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:auth.status});
 try{const [rows]=await database().execute<RowDataPacket[]>("SELECT id,event_key,tenant_id,recipient_email,subject,status,attempts,last_error,next_attempt_at,sent_at,created_at FROM platform_notification_outbox ORDER BY created_at DESC LIMIT 100");return NextResponse.json({ok:true,items:rows});}
 catch{return NextResponse.json({ok:false,code:"OUTBOX_UNAVAILABLE"},{status:503});}
}
export async function PATCH(req:Request){
 try{assertSameOrigin(req);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const auth=await authorize(true);if(auth.status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:auth.status});
 const body=await req.json().catch(()=>null);
 if(!body||typeof body.id!=="string"||!/^[0-9a-f-]{36}$/i.test(body.id))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{await db.beginTransaction();const [rows]=await db.execute<RowDataPacket[]>("SELECT status FROM platform_notification_outbox WHERE id=? FOR UPDATE",[body.id]);if(!rows.length||rows[0].status!=="failed"){await db.rollback();return NextResponse.json({ok:false,code:"NOT_RETRYABLE"},{status:409});}
 await db.execute("UPDATE platform_notification_outbox SET status='pending',next_attempt_at=NOW(),last_error=NULL WHERE id=?",[body.id]);
 await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id) VALUES (?,'notification.retry','outbox',?)",[auth.id,body.id]);await db.commit();return NextResponse.json({ok:true});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"RETRY_FAILED"},{status:503});}finally{db.release();}
}
