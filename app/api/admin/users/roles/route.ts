import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
export async function PATCH(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const actor=await currentActiveAdminUserId();if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(actor,["super_admin"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const body=await request.json().catch(()=>null);
 if(!body||typeof body.userId!=="string"||!/^[0-9a-f-]{36}$/i.test(body.userId)||body.userId===actor||!["admin","support","none"].includes(body.role))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{
 await db.beginTransaction();
 const [users]=await db.execute<RowDataPacket[]>("SELECT status FROM users WHERE id=? FOR UPDATE",[body.userId]);
 if(!users.length){await db.rollback();return NextResponse.json({ok:false,code:"USER_NOT_FOUND"},{status:404});}
 if(users[0].status!=="active"&&body.role!=="none"){await db.rollback();return NextResponse.json({ok:false,code:"USER_NOT_ACTIVE"},{status:409});}
 const [existing]=await db.execute<RowDataPacket[]>("SELECT role,enabled FROM platform_admins WHERE user_id=? FOR UPDATE",[body.userId]);
 if(existing[0]?.role==="super_admin"){await db.rollback();return NextResponse.json({ok:false,code:"SUPER_ADMIN_PROTECTED"},{status:403});}
 if(body.role==="none"){await db.execute("DELETE FROM platform_admins WHERE user_id=?",[body.userId]);}
 else await db.execute("INSERT INTO platform_admins(user_id,role,enabled) VALUES (?,?,TRUE) ON DUPLICATE KEY UPDATE role=VALUES(role),enabled=TRUE",[body.userId,body.role]);
 await db.execute("DELETE FROM auth_sessions WHERE user_id=?",[body.userId]);
 await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id,metadata_json) VALUES (?,?,?,?,?)",[actor,"platform.role.update","user",body.userId,JSON.stringify({previous:existing[0]?.enabled?existing[0].role:"none",next:body.role})]);
 await db.commit();return NextResponse.json({ok:true});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"ROLE_UPDATE_FAILED"},{status:503});}finally{db.release();}
}
