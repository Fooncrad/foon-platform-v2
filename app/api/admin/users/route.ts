import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
export async function PATCH(req:Request){
 try{assertSameOrigin(req);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const actor=await currentActiveAdminUserId();if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(actor,["super_admin"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const body=await req.json().catch(()=>null);
 if(!body||typeof body.userId!=="string"||!/^[a-f0-9-]{36}$/i.test(body.userId)||!["active","suspended"].includes(body.status)||body.userId===actor)return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{await db.beginTransaction();
 const [users]=await db.execute<RowDataPacket[]>("SELECT status FROM users WHERE id=? FOR UPDATE",[body.userId]);
 if(!users.length){await db.rollback();return NextResponse.json({ok:false,code:"USER_NOT_FOUND"},{status:404});}
 const [admins]=await db.execute<RowDataPacket[]>("SELECT role,enabled FROM platform_admins WHERE user_id=? FOR UPDATE",[body.userId]);
 if(admins[0]?.role==="super_admin"){await db.rollback();return NextResponse.json({ok:false,code:"SUPER_ADMIN_PROTECTED"},{status:403});}
 await db.execute("UPDATE users SET status=? WHERE id=?",[body.status,body.userId]);
 if(body.status==="suspended")await db.execute("DELETE FROM auth_sessions WHERE user_id=?",[body.userId]);
 await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id,metadata_json) VALUES (?,?,?,?,?)",[actor,"user.status.update","user",body.userId,JSON.stringify({previous:users[0].status,next:body.status})]);
 await db.commit();return NextResponse.json({ok:true});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"USER_UPDATE_FAILED"},{status:503});}finally{db.release();}
}
