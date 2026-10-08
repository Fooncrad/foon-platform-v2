import {validStoreSlug} from "@/scripts/store-slug.mjs";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { database } from "@/lib/db/mysql";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { provisionStore } from "@/scripts/provision-store.mjs";

export const runtime="nodejs";
export async function POST(request:Request){
  try{
    try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
    const body=await request.json().catch(()=>null);
    if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
    const email=String(body.email??"").trim().toLowerCase();
    const password=String(body.password??"");
    const name=String(body.name??"").trim().slice(0,180);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || password.length<9 || password.length>128) return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
    const id=randomUUID(), hash=await hashPassword(password);
    const storeName=typeof body.storeName==="string"?body.storeName.trim():name||"متجري";
    const slug=typeof body.slug==="string"?body.slug.trim().toLowerCase():"store-"+id;
    if(storeName.length<2||storeName.length>180||!validStoreSlug(slug)||body.kind!==undefined&&!['store','restaurant'].includes(body.kind))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
    const db=await database().getConnection();
    let stage="user";
    try{
      await db.beginTransaction();
      await db.execute("INSERT INTO users(id,email,password_hash,display_name,status) VALUES (?,?,?,?,?)",[id,email,hash,name||null,"active"]);
      stage="store";
      const workspace=await provisionStore(db,{ownerId:id,name:storeName,slug,kind:body.kind==="restaurant"?"restaurant":"store"});
      await createSession(id,db);
      await db.commit();
      return NextResponse.json({ok:true,user:{id,email},...workspace,plan:"free"},{status:201});
    }catch(error){
      await db.rollback();
      if((error as {code?:string}).code==="ER_DUP_ENTRY")return NextResponse.json({ok:false,code:stage==="user"?"EMAIL_EXISTS":"SLUG_EXISTS"},{status:409});
      throw error;
    }finally{db.release();}
  }catch(error){
    const code=(error as {code?:string})?.code;
    if(code==="ER_DUP_ENTRY") return NextResponse.json({ok:false,code:"EMAIL_EXISTS"},{status:409});
    return NextResponse.json({ok:false,code:"REGISTER_UNAVAILABLE"},{status:503});
  }
}
