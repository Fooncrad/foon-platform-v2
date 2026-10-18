import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentActiveAdminUserId,currentSessionId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";

export async function DELETE(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const actor=await currentActiveAdminUserId();if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(actor,["super_admin","admin","support"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const session=await currentSessionId();if(!session)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const db=await database().getConnection();
 try{await db.beginTransaction();const [rows]=await db.execute<RowDataPacket[]>("SELECT id,tenant_id FROM platform_tenant_support_sessions WHERE auth_session_id=? AND actor_user_id=? AND ended_at IS NULL AND expires_at>UTC_TIMESTAMP() ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[session,actor]);if(!rows.length){await db.rollback();return NextResponse.json({ok:true,ended:false});}await db.execute("UPDATE platform_tenant_support_sessions SET ended_at=UTC_TIMESTAMP() WHERE id=?",[rows[0].id]);await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id,metadata_json) VALUES (?,'admin.tenant.support.end','tenant',?,?)",[actor,rows[0].tenant_id,JSON.stringify({supportSessionId:rows[0].id})]);await db.commit();return NextResponse.json({ok:true,ended:true});}catch{await db.rollback();return NextResponse.json({ok:false,code:"SUPPORT_ACCESS_END_FAILED"},{status:503});}finally{db.release();}
}
