import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 let actor;try{assertSameOrigin(request);actor=await currentActiveAdminUserId();if(!actor)throw Error();await requirePlatformRole(actor,["super_admin"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const {id}=await params;if(!/^[a-f0-9-]{36}$/i.test(id))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id FROM tenants WHERE id=?",[id]);if(!rows.length)return NextResponse.json({ok:false,code:"TENANT_NOT_FOUND"},{status:404});
 await database().execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id) VALUES (?,'admin.tenant.access','tenant',?)",[actor,id]);
 return NextResponse.json({ok:true,url:"/restaurant?tenant="+encodeURIComponent(id)});
}
