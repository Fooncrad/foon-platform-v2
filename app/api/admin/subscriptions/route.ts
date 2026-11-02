import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { currentActiveAdminUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";
import { assertSameOrigin } from "@/lib/security/origin";
import { database } from "@/lib/db/mysql";
async function authorize(write:boolean){
 const id=await currentActiveAdminUserId();if(!id)return 401;
 try{await requirePlatformRole(id,write?["super_admin","admin"]:["super_admin","admin","support"]);return 200;}catch{return 403;}
}
export async function GET(){
 const status=await authorize(false);if(status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status});
 try{const [rows]=await database().execute<RowDataPacket[]>("SELECT t.id AS tenant_id,t.name AS tenant_name,s.id AS subscription_id,s.status,s.plan_id,p.name_ar AS plan_name,s.starts_at,s.ends_at FROM tenants t LEFT JOIN tenant_subscriptions s ON s.tenant_id=t.id LEFT JOIN package_plans p ON p.id=s.plan_id ORDER BY t.created_at DESC LIMIT 200");return NextResponse.json({ok:true,tenants:rows});}
 catch{return NextResponse.json({ok:false,code:"SUBSCRIPTIONS_UNAVAILABLE"},{status:503});}
}
export async function PUT(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const auth=await authorize(true);if(auth!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:auth});
 const body=await request.json().catch(()=>null);
 if(!body||typeof body.tenant_id!=="string"||typeof body.plan_id!=="string"||!["active","pending","cancelled","expired"].includes(body.status))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const starts=body.starts_at??null,ends=body.ends_at??null;
 if((starts!==null||ends!==null)&&(![starts,ends].every(v=>v===null||typeof v==="string"&&/^\d{4}-\d\d-\d\d$/.test(v))))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{
  const [tenants]=await database().execute<RowDataPacket[]>("SELECT id FROM tenants WHERE id=?",[body.tenant_id]);
  const [plans]=await database().execute<RowDataPacket[]>("SELECT id FROM package_plans WHERE id=? AND enabled=TRUE",[body.plan_id]);
  if(!tenants.length||!plans.length)return NextResponse.json({ok:false,code:"TENANT_OR_PLAN_NOT_FOUND"},{status:404});
  await database().execute("INSERT INTO tenant_subscriptions(id,tenant_id,plan_id,status,starts_at,ends_at) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE plan_id=VALUES(plan_id),status=VALUES(status),starts_at=VALUES(starts_at),ends_at=VALUES(ends_at)",[randomUUID(),body.tenant_id,body.plan_id,body.status,starts,ends]);
  return NextResponse.json({ok:true});
 }catch{return NextResponse.json({ok:false,code:"SUBSCRIPTION_SAVE_UNAVAILABLE"},{status:503});}
}
