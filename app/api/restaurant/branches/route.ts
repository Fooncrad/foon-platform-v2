import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { currentUserId } from "@/lib/auth/session";
import { requireTenantMembership } from "@/lib/auth/authorization";
import { database } from "@/lib/db/mysql";
import { assertSameOrigin } from "@/lib/security/origin";

export async function GET(request:Request){
 const userId=await currentUserId(); if(!userId)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const tenant=request.headers.get("x-foon-tenant"); if(!tenant)return NextResponse.json({ok:false,code:"TENANT_CONTEXT_REQUIRED"},{status:400});
 try{const ctx=await requireTenantMembership(userId,tenant,["owner","manager","cashier","waiter","kitchen","driver","accountant"]);
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id,name,slug,enabled,created_at FROM branches WHERE tenant_id=? ORDER BY created_at",[ctx.tenantId]);return NextResponse.json({ok:true,branches:rows});}
 catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
}
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const userId=await currentUserId(); if(!userId)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const tenant=request.headers.get("x-foon-tenant"); if(!tenant)return NextResponse.json({ok:false,code:"TENANT_CONTEXT_REQUIRED"},{status:400});
 try{const ctx=await requireTenantMembership(userId,tenant,["owner","manager"]); const body=await request.json().catch(()=>null);
 if(!body || typeof body!=="object" || Array.isArray(body))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const name=String(body.name??"").trim().slice(0,180);const slug=String(body.slug??"").trim().toLowerCase();
 if(name.length<2||!/^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$/.test(slug))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const id=randomUUID();await database().execute("INSERT INTO branches(id,tenant_id,name,slug) VALUES (?,?,?,?)",[id,ctx.tenantId,name,slug]);return NextResponse.json({ok:true,branch:{id,name,slug,enabled:true}},{status:201});}
 catch(e){if((e as {code?:string}).code==="ER_DUP_ENTRY")return NextResponse.json({ok:false,code:"BRANCH_SLUG_EXISTS"},{status:409});return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
}
