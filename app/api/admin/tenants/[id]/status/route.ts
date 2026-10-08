import { NextResponse } from "next/server";
import { currentActiveAdminUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";
import type {RowDataPacket} from "mysql2/promise";
import { database } from "@/lib/db/mysql";
import { assertSameOrigin } from "@/lib/security/origin";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const userId=await currentActiveAdminUserId(); if(!userId)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(userId,["super_admin","admin"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const {id}=await params; const body=await request.json().catch(()=>null);
 if(!body || typeof body!=="object" || Array.isArray(body))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const status=String(body.status??"");
 if(!["pending","active","suspended"].includes(status))return NextResponse.json({ok:false,code:"INVALID_STATUS"},{status:400});
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [rows]=await db.execute<RowDataPacket[]>("SELECT status FROM tenants WHERE id=? FOR UPDATE",[id]);
  if(!rows.length){await db.rollback();return NextResponse.json({ok:false,code:"TENANT_NOT_FOUND"},{status:404});}
  await db.execute("UPDATE tenants SET status=? WHERE id=?",[status,id]);
  await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id,metadata_json) VALUES (?,?,?,?,?)",[userId,"tenant.status","tenant",id,JSON.stringify({previous:rows[0].status,next:status})]);
  await db.commit();return NextResponse.json({ok:true,status});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"TENANT_STATUS_FAILED"},{status:503});}finally{db.release();}
}
