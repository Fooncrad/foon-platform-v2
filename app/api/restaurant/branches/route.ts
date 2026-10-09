import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { currentUserId } from "@/lib/auth/session";
import { requireTenantMembership } from "@/lib/auth/authorization";
import { database } from "@/lib/db/mysql";
import { tenantEntitlement } from "@/lib/plans/entitlements";
import { assertSameOrigin } from "@/lib/security/origin";
import {branchVersion} from "@/lib/restaurant/branch-version";

export async function GET(request:Request){
 const userId=await currentUserId(); if(!userId)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const tenant=request.headers.get("x-foon-tenant"); if(!tenant)return NextResponse.json({ok:false,code:"TENANT_CONTEXT_REQUIRED"},{status:400});
 try{const ctx=await requireTenantMembership(userId,tenant,["owner","manager","cashier","waiter","kitchen","driver","accountant"]);
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id,name,slug,enabled,created_at FROM branches WHERE tenant_id=? ORDER BY created_at",[ctx.tenantId]);return NextResponse.json({ok:true,branches:rows.map(b=>({...b,version:branchVersion({name:b.name,slug:b.slug,enabled:b.enabled})}))});}
 catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
}
export async function PATCH(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const userId=await currentUserId();if(!userId)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const body=await request.json().catch(()=>null);
 if(!body||typeof body.id!=="string"||typeof body.version!=="string")return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 let ctx;
 try{ctx=await requireTenantMembership(userId,request.headers.get("x-foon-tenant")??"",["owner","manager"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [rows]=await db.execute<RowDataPacket[]>("SELECT name,slug,enabled FROM branches WHERE id=? AND tenant_id=? FOR UPDATE",[body.id,ctx.tenantId]);
  const branch=rows[0];if(!branch){await db.rollback();return NextResponse.json({ok:false,code:"BRANCH_NOT_FOUND"},{status:404});}
  if(body.version!==branchVersion({name:branch.name,slug:branch.slug,enabled:branch.enabled})){await db.rollback();return NextResponse.json({ok:false,code:"CONFLICT"},{status:409});}
  const name=body.name===undefined?String(branch.name):typeof body.name==="string"?body.name.trim():"",slug=body.slug===undefined?String(branch.slug):typeof body.slug==="string"?body.slug.trim().toLowerCase():"",enabled=body.enabled===undefined?Boolean(branch.enabled):body.enabled;
  if(name.length<2||name.length>180||typeof enabled!=="boolean"||!/^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$/.test(slug)){await db.rollback();return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});}
  if(!enabled){const [[open]]=await db.execute<RowDataPacket[]>("SELECT COUNT(*) AS n FROM restaurant_orders WHERE tenant_id=? AND branch_id=? AND status IN ('new','preparing','ready')",[ctx.tenantId,body.id]);if(Number(open.n)>0){await db.rollback();return NextResponse.json({ok:false,code:"BRANCH_HAS_OPEN_ORDERS"},{status:409});}}
  await db.execute("UPDATE branches SET name=?,slug=?,enabled=? WHERE id=? AND tenant_id=?",[name,slug,enabled,body.id,ctx.tenantId]);
  await db.execute("INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id,metadata) VALUES (?,?,'branch.update',?,?)",[ctx.tenantId,userId,body.id,JSON.stringify({name,slug,enabled})]);
  await db.commit();return NextResponse.json({ok:true});
 }catch(error){await db.rollback();return NextResponse.json({ok:false,code:(error as {code?:string}).code==="ER_DUP_ENTRY"?"BRANCH_SLUG_EXISTS":"BRANCH_UPDATE_UNAVAILABLE"},{status:(error as {code?:string}).code==="ER_DUP_ENTRY"?409:503});}finally{db.release();}
}
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const userId=await currentUserId();if(!userId)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 let ctx;try{ctx=await requireTenantMembership(userId,request.headers.get("x-foon-tenant")??"",["owner","manager"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const name=typeof body.name==="string"?body.name.trim():"",slug=typeof body.slug==="string"?body.slug.trim().toLowerCase():"";
 if(name.length<2||name.length>180||!/^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$/.test(slug))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{
  await db.beginTransaction();await db.execute("SELECT id FROM tenants WHERE id=? FOR UPDATE",[ctx.tenantId]);
  const entitlement=await tenantEntitlement(ctx.tenantId,"multi_branch");
  const [[existing]]=await db.execute<RowDataPacket[]>("SELECT COUNT(*) AS total FROM branches WHERE tenant_id=?",[ctx.tenantId]);
  const count=Number(existing.total);
  if(count>=1&&!entitlement.enabled){await db.rollback();return NextResponse.json({ok:false,code:"PLAN_FEATURE_REQUIRED"},{status:403});}
  if(entitlement.limit!==null&&count>=entitlement.limit){await db.rollback();return NextResponse.json({ok:false,code:"PLAN_LIMIT_REACHED"},{status:403});}
  const id=randomUUID();await db.execute("INSERT INTO branches(id,tenant_id,name,slug) VALUES (?,?,?,?)",[id,ctx.tenantId,name,slug]);
  await db.execute("INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id,metadata) VALUES (?,?,'branch.create',?,?)",[ctx.tenantId,userId,id,JSON.stringify({name,slug})]);
  await db.commit();return NextResponse.json({ok:true,branch:{id,name,slug,enabled:true,version:branchVersion({name,slug,enabled:true})}},{status:201});
 }catch(error){await db.rollback();return NextResponse.json({ok:false,code:(error as {code?:string}).code==="ER_DUP_ENTRY"?"BRANCH_SLUG_EXISTS":"BRANCH_CREATE_UNAVAILABLE"},{status:(error as {code?:string}).code==="ER_DUP_ENTRY"?409:503});}finally{db.release();}
}
