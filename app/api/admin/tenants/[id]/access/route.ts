import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentActiveAdminUserId,currentSessionId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const actor=await currentActiveAdminUserId();if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 let role:"super_admin"|"admin"|"support";try{({role}=await requirePlatformRole(actor,["super_admin","admin","support"]));}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const authSession=await currentSessionId();if(!authSession)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const {id}=await params;if(!/^[a-f0-9-]{36}$/i.test(id))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [sessions]=await db.execute<RowDataPacket[]>("SELECT id FROM auth_sessions WHERE id=? AND user_id=? AND expires_at>NOW() FOR UPDATE",[authSession,actor]);
  if(!sessions.length){await db.rollback();return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});}
  const [tenants]=await db.execute<RowDataPacket[]>("SELECT id FROM tenants WHERE id=? AND status='active' FOR UPDATE",[id]);
  if(!tenants.length){await db.rollback();return NextResponse.json({ok:false,code:"TENANT_NOT_FOUND_OR_INACTIVE"},{status:404});}
  await db.execute("UPDATE platform_tenant_support_sessions SET ended_at=NOW() WHERE auth_session_id=? AND ended_at IS NULL",[authSession]);
  const supportId=randomUUID();
  await db.execute("INSERT INTO platform_tenant_support_sessions(id,auth_session_id,actor_user_id,tenant_id,platform_role,expires_at) VALUES (?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 2 HOUR))",[supportId,authSession,actor,id,role]);
  await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id,metadata_json) VALUES (?,'admin.tenant.support.start','tenant',?,?)",[actor,id,JSON.stringify({supportSessionId:supportId,platformRole:role,accessMode:role==="support"?"read_only":"full",printerSettingsUnaffected:true,expiresInMinutes:120})]);
  await db.commit();return NextResponse.json({ok:true,url:"/restaurant?tenant="+encodeURIComponent(id),expiresInMinutes:120,accessMode:role==="support"?"read_only":"full",readOnly:role==="support",printerSettingsUnaffected:true});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"SUPPORT_ACCESS_FAILED"},{status:503});}finally{db.release();}
}
