import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth/session";
import { database } from "@/lib/db/mysql";
import { assertSameOrigin } from "@/lib/security/origin";

export const runtime="nodejs";
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const userId=await currentUserId();if(!userId)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const name=typeof body.name==="string"?body.name.trim():"";
 const slug=typeof body.slug==="string"?body.slug.trim().toLowerCase():"";
 const kind=body.kind==="store"?"store":"restaurant";
 if(name.length<2||name.length>180||!/^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$/.test(slug))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [users]=await db.execute<import("mysql2/promise").RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status='active' LIMIT 1",[userId]);
  if(!users.length){await db.rollback();return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
  const tenantId=randomUUID(),branchId=randomUUID(),membershipId=randomUUID();
  await db.execute("INSERT INTO tenants(id,slug,name,kind,status) VALUES (?,?,?,?,?)",[tenantId,slug,name,kind,"active"]);
  await db.execute("INSERT INTO branches(id,tenant_id,name,slug,enabled) VALUES (?,?,?,?,TRUE)",[branchId,tenantId,name,"main"]);
  await db.execute("INSERT INTO memberships(id,tenant_id,user_id,role,status) VALUES (?,?,?,?,?)",[membershipId,tenantId,userId,"owner","active"]);
  await db.commit();
  return NextResponse.json({ok:true,tenant:{id:tenantId,slug,name},branch:{id:branchId}},{status:201});
 }catch(error){
  await db.rollback();
  if((error as {code?:string}).code==="ER_DUP_ENTRY")return NextResponse.json({ok:false,code:"SLUG_EXISTS"},{status:409});
  return NextResponse.json({ok:false,code:"ONBOARD_UNAVAILABLE"},{status:503});
 }finally{db.release();}
}
