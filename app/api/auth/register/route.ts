import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { database } from "@/lib/db/mysql";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export const runtime="nodejs";
export async function POST(request:Request){
  try{
    const body=await request.json();
    const email=String(body.email??"").trim().toLowerCase();
    const password=String(body.password??"");
    const name=String(body.name??"").trim().slice(0,180);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<9) return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
    const id=randomUUID(), hash=await hashPassword(password);
    await database().execute("INSERT INTO users(id,email,password_hash,display_name,status) VALUES (?,?,?,?,?)",[id,email,hash,name||null,"active"]);
    await createSession(id);
    return NextResponse.json({ok:true,user:{id,email}},{status:201});
  }catch(error){
    const code=(error as {code?:string})?.code;
    if(code==="ER_DUP_ENTRY") return NextResponse.json({ok:false,code:"EMAIL_EXISTS"},{status:409});
    return NextResponse.json({ok:false,code:"REGISTER_UNAVAILABLE"},{status:503});
  }
}
