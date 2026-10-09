import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {tenantEntitlement} from "@/lib/plans/entitlements";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import type {RowDataPacket} from "mysql2/promise";
export const runtime="nodejs";
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 let tenantId:string;
 try{tenantId=(await requireTenantMembership(user,request.headers.get("x-foon-tenant")??"",["owner","manager"])).tenantId;}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 if(!(await tenantEntitlement(tenantId,"branding.logo")).enabled)return NextResponse.json({ok:false,code:"PLAN_FEATURE_REQUIRED"},{status:403});
 if(Number(request.headers.get("content-length")??0)>3*1024*1024)return NextResponse.json({ok:false,code:"IMAGE_TOO_LARGE"},{status:413});
 const form=await request.formData().catch(()=>null),file=form?.get("file");
 if(!(file instanceof File)||!file.size||file.size>2*1024*1024)return NextResponse.json({ok:false,code:"INVALID_IMAGE"},{status:400});
 const bytes=Buffer.from(await file.arrayBuffer());
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
 const mime=png?"image/png":jpg?"image/jpeg":webp?"image/webp":null;
 if(!mime||file.type!==mime)return NextResponse.json({ok:false,code:"INVALID_IMAGE"},{status:400});
 const db=await database().getConnection();
 try{
  await db.beginTransaction();await db.execute("SELECT id FROM tenants WHERE id=? FOR UPDATE",[tenantId]);
  const [[used]]=await db.execute<RowDataPacket[]>("SELECT COALESCE(SUM(size_bytes),0) AS total FROM restaurant_assets WHERE tenant_id=?",[tenantId]);
  if(Number(used.total)+bytes.length>50*1024*1024){await db.rollback();return NextResponse.json({ok:false,code:"IMAGE_STORAGE_LIMIT"},{status:409});}
  const id=randomUUID();await db.execute("INSERT INTO restaurant_assets(id,tenant_id,mime_type,bytes,size_bytes) VALUES (?,?,?,?,?)",[id,tenantId,mime,bytes,bytes.length]);
  await db.execute("INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id,metadata) VALUES (?,?,'asset.upload',?,?)",[tenantId,user,id,JSON.stringify({mime,size:bytes.length})]);
  await db.commit();return NextResponse.json({ok:true,url:"/api/restaurant/assets/"+id},{status:201});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"UPLOAD_UNAVAILABLE"},{status:503});}finally{db.release();}
}
