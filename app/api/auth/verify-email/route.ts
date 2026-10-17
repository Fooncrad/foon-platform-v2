import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {validVerificationToken,verificationTokenHash} from "@/lib/auth/email-verification";
export const runtime="nodejs";
const failure=(code:string,status:number)=>NextResponse.json({ok:false,code},{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return failure("FORBIDDEN",403);}
 const body=await request.json().catch(()=>null);
 if(!validVerificationToken(body?.token))return failure("INVALID_VERIFICATION_TOKEN",400);
 const hash=verificationTokenHash(body.token);
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [found]=await db.execute<RowDataPacket[]>(
   "SELECT user_id FROM email_verification_tokens WHERE token_hash=? LIMIT 1",[hash]);
  if(!found.length){await db.rollback();return failure("VERIFICATION_LINK_INVALID",400);}
  // Lock user before token to serialize simultaneous link/re-send requests.
  const [users]=await db.execute<RowDataPacket[]>(
   "SELECT id,status,email_verified_at FROM users WHERE id=? FOR UPDATE",[found[0].user_id]);
  if(!users.length||users[0].status!=="active"){
   await db.rollback();return failure("VERIFICATION_LINK_INVALID",400);
  }
  const [tokens]=await db.execute<RowDataPacket[]>(
   "SELECT id FROM email_verification_tokens WHERE user_id=? AND token_hash=? AND used_at IS NULL AND expires_at>NOW() LIMIT 1 FOR UPDATE",
   [found[0].user_id,hash]);
  if(!tokens.length){await db.rollback();return failure("VERIFICATION_LINK_INVALID",400);}
  await db.execute("UPDATE users SET email_verified_at=COALESCE(email_verified_at,NOW()) WHERE id=? AND status='active'",[found[0].user_id]);
  await db.execute("UPDATE email_verification_tokens SET used_at=NOW() WHERE user_id=? AND used_at IS NULL",[found[0].user_id]);
  await db.commit();
  return NextResponse.json({ok:true,verified:true},{headers:{"Cache-Control":"no-store"}});
 }catch{await db.rollback();return failure("VERIFICATION_UNAVAILABLE",503);}finally{db.release();}
}
