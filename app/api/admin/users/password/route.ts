import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
import {hashPassword} from "@/lib/auth/password";
import {canResetAccountPassword} from "@/scripts/admin-policy.mjs";
export async function PATCH(request:Request){
 let actor;
 try{assertSameOrigin(request);actor=await currentActiveAdminUserId();if(!actor)throw Error();await requirePlatformRole(actor,["super_admin"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const b=await request.json().catch(()=>null);
 if(!b||typeof b.userId!=="string"||!/^[a-f0-9-]{36}$/i.test(b.userId)||!canResetAccountPassword(actor,b.userId,null,b.password))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const hash=await hashPassword(b.password);const db=await database().getConnection();
 try{await db.beginTransaction();const [rows]=await db.execute<RowDataPacket[]>("SELECT u.id,p.role FROM users u LEFT JOIN platform_admins p ON p.user_id=u.id WHERE u.id=? FOR UPDATE",[b.userId]);
 if(!rows.length){await db.rollback();return NextResponse.json({ok:false,code:"USER_NOT_FOUND"},{status:404});}
 if(!canResetAccountPassword(actor,b.userId,rows[0].role??null,b.password)){await db.rollback();return NextResponse.json({ok:false,code:"PROTECTED_ACCOUNT"},{status:403});}
 await db.execute("UPDATE users SET password_hash=? WHERE id=?",[hash,b.userId]);
 await db.execute("DELETE FROM auth_sessions WHERE user_id=?",[b.userId]);
 await db.execute("UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=? AND used_at IS NULL",[b.userId]);
 await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id) VALUES (?,'user.password.reset','user',?)",[actor,b.userId]);
 await db.commit();return NextResponse.json({ok:true});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"PASSWORD_RESET_FAILED"},{status:503});}finally{db.release();}
}
