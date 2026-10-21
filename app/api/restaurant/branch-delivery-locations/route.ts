import {NextResponse} from "next/server";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import type {RowDataPacket} from "mysql2/promise";
export const runtime="nodejs";
export async function GET(request:Request){
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const tenant=request.headers.get("x-foon-tenant")??"";
 try{
  await requireTenantMembership(user,tenant,["owner","manager"]);
  const [rows]=await database().execute<RowDataPacket[]>("SELECT b.id,b.name,b.enabled,l.latitude,l.longitude FROM branches b LEFT JOIN branch_delivery_locations l ON l.branch_id=b.id AND l.tenant_id=b.tenant_id WHERE b.tenant_id=? ORDER BY b.created_at,b.id",[tenant]);
  return NextResponse.json({ok:true,branches:rows.map(b=>({id:b.id,name:b.name,enabled:Boolean(b.enabled),latitude:b.latitude===null?null:Number(b.latitude),longitude:b.longitude===null?null:Number(b.longitude)}))},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
}
export async function PUT(request:Request){
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const tenant=request.headers.get("x-foon-tenant")??"";
 const body=await request.json().catch(()=>null);
 if(!body||typeof body.branchId!=="string"||typeof body.latitude!=="number"||typeof body.longitude!=="number"
 ||!Number.isFinite(body.latitude)||!Number.isFinite(body.longitude)||body.latitude< -90||body.latitude>90||body.longitude< -180||body.longitude>180)
 return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{await requireTenantMembership(user,tenant,["owner","manager"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 try{
  const [rows]=await database().execute<RowDataPacket[]>("SELECT id FROM branches WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[body.branchId,tenant]);
  if(!rows.length)return NextResponse.json({ok:false,code:"BRANCH_NOT_FOUND"},{status:404});
  await database().execute("INSERT INTO branch_delivery_locations(branch_id,tenant_id,latitude,longitude) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE latitude=VALUES(latitude),longitude=VALUES(longitude)",[body.branchId,tenant,body.latitude,body.longitude]);
  return NextResponse.json({ok:true});
 }catch{return NextResponse.json({ok:false,code:"SAVE_FAILED"},{status:503});}
}
