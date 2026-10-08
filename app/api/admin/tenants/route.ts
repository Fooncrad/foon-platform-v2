import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { currentActiveAdminUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";
import { database } from "@/lib/db/mysql";

export async function GET(){
 const userId=await currentActiveAdminUserId(); if(!userId)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(userId,["super_admin","admin","support"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id,slug,name,kind,status,default_locale,created_at FROM tenants ORDER BY created_at DESC LIMIT 200");
 return NextResponse.json({ok:true,tenants:rows});
}
export { POST } from "./provision/route";
