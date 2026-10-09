import {createHash} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {hashPassword} from "@/lib/auth/password";
import {assertSameOrigin} from "@/lib/security/origin";
export const runtime="nodejs";
export async function POST(request:Request){
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const body=await request.json().catch(()=>null);
 const token=typeof body?.token==="string"?body.token:"";
 const password=typeof body?.password==="string"?body.password:"";
 if(!/^[A-Za-z0-9_-]{43}$/.test(token)||password.length<9||password.length>128)return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{
  const hash=await hashPassword(password);
  const tokenHash=createHash("sha256").update(token).digest("hex");
  const connection=await database().getConnection();
  try{
   await connection.beginTransaction();
   const [rows]=await connection.execute<RowDataPacket[]>("SELECT id,user_id FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>NOW() LIMIT 1 FOR UPDATE",[tokenHash]);
   const item=rows[0];
   if(!item){await connection.rollback();return NextResponse.json({ok:false,code:"RESET_TOKEN_INVALID"},{status:400})}
   await connection.execute("UPDATE users SET password_hash=? WHERE id=? AND status='active'",[hash,item.user_id]);
   await connection.execute("UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=? AND used_at IS NULL",[item.user_id]);
   await connection.execute("DELETE FROM auth_sessions WHERE user_id=?",[item.user_id]);
   await connection.commit();
   return NextResponse.json({ok:true});
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
 }catch{return NextResponse.json({ok:false,code:"RESET_UNAVAILABLE"},{status:503})}
}
