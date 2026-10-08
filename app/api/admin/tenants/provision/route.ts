import {validStoreSlug} from "@/scripts/store-slug.mjs";
import { provisionStore } from "@/scripts/provision-store.mjs";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { currentActiveAdminUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";
import { database } from "@/lib/db/mysql";
import { assertSameOrigin } from "@/lib/security/origin";

export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const actor=await currentActiveAdminUserId(); if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(actor,["super_admin","admin"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const body=await request.json().catch(()=>null);
 if(!body || typeof body!=="object" || Array.isArray(body))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const name=String(body.name??"").trim().slice(0,180); const slug=String(body.slug??"").trim().toLowerCase();
 const ownerEmail=String(body.ownerEmail??"").trim().toLowerCase(); const branchName=String(body.branchName??name).trim().slice(0,180);
 if(name.length<2||branchName.length<2||!validStoreSlug(slug)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [users]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE email=? AND status='active' LIMIT 1",[ownerEmail]); if(!users.length){await db.rollback();return NextResponse.json({ok:false,code:"OWNER_NOT_FOUND"},{status:404});}
  const ownerId=String(users[0].id);
  const workspace=await provisionStore(db,{ownerId,name,slug,branchName,kind:body.kind==="store"?"store":"restaurant"});
  await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id,metadata_json) VALUES (?,?,?,?,?)",[actor,"tenant.provision","tenant",workspace.tenant.id,JSON.stringify({slug,ownerEmail,plan:"free"})]);
  await db.commit();
  return NextResponse.json({ok:true,...workspace,plan:"free",owner:{id:ownerId,email:ownerEmail}},{status:201});
 }catch(e){await db.rollback();if((e as {code?:string}).code==="ER_DUP_ENTRY")return NextResponse.json({ok:false,code:"DUPLICATE_RESOURCE"},{status:409});return NextResponse.json({ok:false,code:"PROVISION_FAILED"},{status:503});}finally{db.release();}
}
