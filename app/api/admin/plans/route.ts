import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { currentActiveAdminUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";
import { database } from "@/lib/db/mysql";
import { assertSameOrigin } from "@/lib/security/origin";

export const runtime="nodejs";
export async function GET(){
 const user=await currentActiveAdminUserId();if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(user,["super_admin","admin","support"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 try{
  const [plans]=await database().execute<RowDataPacket[]>("SELECT id,code,name_ar,name_en,name_fr,enabled,sort_order FROM package_plans ORDER BY sort_order,code LIMIT 100");
  return NextResponse.json({ok:true,plans});
 }catch{return NextResponse.json({ok:false,code:"PLAN_CATALOG_UNAVAILABLE"},{status:503});}
}
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const user=await currentActiveAdminUserId();if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(user,["super_admin","admin"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const code=typeof body.code==="string"?body.code.trim().toLowerCase():"";
 const ar=typeof body.name_ar==="string"?body.name_ar.trim():"";
 const en=typeof body.name_en==="string"?body.name_en.trim():"";
 const fr=typeof body.name_fr==="string"?body.name_fr.trim():"";
 if(!/^[a-z][a-z0-9_-]{1,79}$/.test(code)||![ar,en,fr].every(x=>x.length>=2&&x.length<=180))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const id=randomUUID();
 try{await database().execute("INSERT INTO package_plans(id,code,name_ar,name_en,name_fr) VALUES (?,?,?,?,?)",[id,code,ar,en,fr]);return NextResponse.json({ok:true,plan:{id,code,name_ar:ar,name_en:en,name_fr:fr}},{status:201});}
 catch(error){if((error as {code?:string}).code==="ER_DUP_ENTRY")return NextResponse.json({ok:false,code:"PLAN_CODE_EXISTS"},{status:409});return NextResponse.json({ok:false,code:"PLAN_CREATE_UNAVAILABLE"},{status:503});}
}
