import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";
import { database } from "@/lib/db/mysql";
import { platformAudit } from "@/lib/platform/audit";
import { assertSameOrigin } from "@/lib/security/origin";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const userId=await currentUserId(); if(!userId)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(userId,["super_admin","admin"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const {id}=await params; const body=await request.json(); const status=String(body.status??"");
 if(!["pending","active","suspended"].includes(status))return NextResponse.json({ok:false,code:"INVALID_STATUS"},{status:400});
 const [result]=await database().execute("UPDATE tenants SET status=? WHERE id=?",[status,id]);
 if((result as {affectedRows?:number}).affectedRows!==1)return NextResponse.json({ok:false,code:"TENANT_NOT_FOUND"},{status:404});
 await platformAudit(userId,"tenant.status","tenant",id,{status}); return NextResponse.json({ok:true,status});
}
