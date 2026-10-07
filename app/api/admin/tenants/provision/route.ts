import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2/promise";
import { currentUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";
import { database } from "@/lib/db/mysql";
import { platformAudit } from "@/lib/platform/audit";

export async function POST(request:Request){
 const actor=await currentUserId(); if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(actor,["super_admin","admin"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const body=await request.json(); const name=String(body.name??"").trim().slice(0,180); const slug=String(body.slug??"").trim().toLowerCase();
 const ownerEmail=String(body.ownerEmail??"").trim().toLowerCase(); const branchName=String(body.branchName??name).trim().slice(0,180);
 if(name.length<2||branchName.length<2||!/^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$/.test(slug)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [users]=await db.execute<any[]>("SELECT id FROM users WHERE email=? LIMIT 1",[ownerEmail]); if(!users.length){await db.rollback();return NextResponse.json({ok:false,code:"OWNER_NOT_FOUND"},{status:404});}
  const tenantId=randomUUID(),branchId=randomUUID(),membershipId=randomUUID(),ownerId=String(users[0].id);
  await db.execute("INSERT INTO tenants(id,slug,name,kind,status) VALUES (?,?,?,?,?)",[tenantId,slug,name,body.kind==="store"?"store":"restaurant","active"]);
  await db.execute("INSERT INTO branches(id,tenant_id,name,slug,enabled) VALUES (?,?,?,?,TRUE)",[branchId,tenantId,branchName,"main"]);
  await db.execute("INSERT INTO memberships(id,tenant_id,user_id,role,status) VALUES (?,?,?,?,?)",[membershipId,tenantId,ownerId,"owner","active"]);
  await db.commit(); await platformAudit(actor,"tenant.provision","tenant",tenantId,{slug,ownerEmail});
  return NextResponse.json({ok:true,tenant:{id:tenantId,name,slug},branch:{id:branchId,name:branchName},owner:{id:ownerId,email:ownerEmail}},{status:201});
 }catch(e){await db.rollback();if((e as {code?:string}).code==="ER_DUP_ENTRY")return NextResponse.json({ok:false,code:"DUPLICATE_RESOURCE"},{status:409});return NextResponse.json({ok:false,code:"PROVISION_FAILED"},{status:503});}finally{db.release();}
}
