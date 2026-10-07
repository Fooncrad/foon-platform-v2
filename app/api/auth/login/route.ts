import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { database } from "@/lib/db/mysql";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { clientIp, loginAllowed, recordLogin } from "@/lib/auth/rate-limit";

export const runtime="nodejs";
export async function POST(request:Request){
 const ip=clientIp(request); let email="";
 try{
  const body=await request.json(); email=String(body.email??"").trim().toLowerCase(); const password=String(body.password??"");
  if(!(await loginAllowed(email,ip))) return NextResponse.json({ok:false,code:"TOO_MANY_ATTEMPTS"},{status:429});
  const [rows]=await database().execute<RowDataPacket[]>("SELECT id,password_hash,status FROM users WHERE email=? LIMIT 1",[email]);
  const user=rows[0]; const valid=!!user?.password_hash && user.status==="active" && await verifyPassword(password,String(user.password_hash));
  await recordLogin(email,ip,valid);
  if(!valid)return NextResponse.json({ok:false,code:"INVALID_CREDENTIALS"},{status:401});
  await createSession(String(user.id)); return NextResponse.json({ok:true});
 }catch{return NextResponse.json({ok:false,code:"LOGIN_UNAVAILABLE"},{status:503});}
}
