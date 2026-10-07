import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { database } from "@/lib/db/mysql";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export const runtime="nodejs";
export async function POST(request:Request){
  try{
    const body=await request.json(); const email=String(body.email??"").trim().toLowerCase(); const password=String(body.password??"");
    const [rows]=await database().execute<RowDataPacket[]>("SELECT id,password_hash,status FROM users WHERE email=? LIMIT 1",[email]);
    const user=rows[0]; if(!user?.password_hash || user.status!=="active" || !(await verifyPassword(password,user.password_hash))) return NextResponse.json({ok:false,code:"INVALID_CREDENTIALS"},{status:401});
    await createSession(String(user.id));
    return NextResponse.json({ok:true});
  }catch{return NextResponse.json({ok:false,code:"LOGIN_UNAVAILABLE"},{status:503});}
}
