import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { currentActiveAdminUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";
import { database } from "@/lib/db/mysql";
import { platformAudit } from "@/lib/platform/audit";
import { assertSameOrigin } from "@/lib/security/origin";

export async function GET(){
 const userId=await currentActiveAdminUserId(); if(!userId)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(userId,["super_admin","admin","support"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id,slug,name,kind,status,default_locale,created_at FROM tenants ORDER BY created_at DESC LIMIT 200");
 return NextResponse.json({ok:true,tenants:rows});
}
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const userId=await currentActiveAdminUserId(); if(!userId)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(userId,["super_admin","admin"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 try{
  const body=await request.json(); const name=String(body.name??"").trim().slice(0,180); const slug=String(body.slug??"").trim().toLowerCase(); const kind=body.kind==="store"?"store":"restaurant";
  if(name.length<2||!/^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$/.test(slug))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
  const id=randomUUID(); await database().execute("INSERT INTO tenants(id,slug,name,kind,status) VALUES (?,?,?,?,?)",[id,slug,name,kind,"pending"]);
  await platformAudit(userId,"tenant.create","tenant",id,{slug,kind}); return NextResponse.json({ok:true,tenant:{id,slug,name,kind,status:"pending"}},{status:201});
 }catch(e){if((e as {code?:string}).code==="ER_DUP_ENTRY")return NextResponse.json({ok:false,code:"SLUG_EXISTS"},{status:409});return NextResponse.json({ok:false,code:"TENANT_CREATE_UNAVAILABLE"},{status:503});}
}
