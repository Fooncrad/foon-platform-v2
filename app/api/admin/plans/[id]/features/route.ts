import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { database } from "@/lib/db/mysql";
import { currentActiveAdminUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";
import { assertSameOrigin } from "@/lib/security/origin";
type Context={params:Promise<{id:string}>};
export async function GET(_request:Request,context:Context){
 const actor=await currentActiveAdminUserId();if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(actor,["super_admin","admin","support"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const {id}=await context.params;
 try{const [features]=await database().execute<RowDataPacket[]>("SELECT f.feature_key,f.name_ar,f.category,f.value_type,COALESCE(pf.enabled,CASE WHEN p.code='enterprise' THEN 1 ELSE 0 END) AS enabled,pf.limit_value FROM package_features f JOIN package_plans p ON p.id=? LEFT JOIN package_plan_features pf ON pf.feature_key=f.feature_key AND pf.plan_id=p.id ORDER BY f.category,f.feature_key",[id]);return NextResponse.json({ok:true,features});}
 catch{return NextResponse.json({ok:false,code:"FEATURES_UNAVAILABLE"},{status:503});}
}
export async function PUT(request:Request,context:Context){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const actor=await currentActiveAdminUserId();if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(actor,["super_admin","admin"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const {id}=await context.params;const body=await request.json().catch(()=>null);
 if(!body||typeof body.feature_key!=="string"||!/^[a-z][a-z0-9._-]{1,99}$/.test(body.feature_key)||typeof body.enabled!=="boolean"||(body.limit_value!==null&&body.limit_value!==undefined&&(!Number.isSafeInteger(body.limit_value)||body.limit_value<0)))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{
  const [plans]=await database().execute<RowDataPacket[]>("SELECT id FROM package_plans WHERE id=?",[id]);if(!plans.length)return NextResponse.json({ok:false,code:"PLAN_NOT_FOUND"},{status:404});
  const [features]=await database().execute<RowDataPacket[]>("SELECT feature_key FROM package_features WHERE feature_key=?",[body.feature_key]);if(!features.length)return NextResponse.json({ok:false,code:"FEATURE_NOT_FOUND"},{status:404});
  await database().execute("INSERT INTO package_plan_features(plan_id,feature_key,enabled,limit_value) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),limit_value=VALUES(limit_value)",[id,body.feature_key,body.enabled,body.limit_value??null]);
  return NextResponse.json({ok:true});
 }catch{return NextResponse.json({ok:false,code:"FEATURE_SAVE_UNAVAILABLE"},{status:503});}
}
