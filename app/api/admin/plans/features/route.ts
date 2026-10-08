import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { currentActiveAdminUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";
import { database } from "@/lib/db/mysql";
import { assertSameOrigin } from "@/lib/security/origin";
import { referenceFeatures } from "@/lib/plans/reference-catalog";

async function authorize(write:boolean){
 const actor=await currentActiveAdminUserId();if(!actor)return 401;
 try{await requirePlatformRole(actor,write?["super_admin","admin"]:["super_admin","admin","support"]);return 200;}catch{return 403;}
}
export async function GET(){
 const status=await authorize(false);if(status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status});
 try{const [rows]=await database().execute<RowDataPacket[]>("SELECT feature_key,name_ar,name_en,category,value_type FROM package_features ORDER BY category,feature_key");
 return NextResponse.json({ok:true,features:rows,referenceCount:referenceFeatures.length});}
 catch{return NextResponse.json({ok:false,code:"FEATURE_CATALOG_UNAVAILABLE"},{status:503});}
}
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const status=await authorize(true);if(status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status});
 const body=await request.json().catch(()=>null);
 if(!body||body.action!=="import_reference")return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  for(const [key,ar,en,category] of referenceFeatures){
   await db.execute("INSERT INTO package_features(feature_key,name_ar,name_en,category,value_type) VALUES (?,?,?,?,'boolean') ON DUPLICATE KEY UPDATE feature_key=feature_key",[key,ar,en,category]);
  }
  await db.commit();
  return NextResponse.json({ok:true,imported:referenceFeatures.length,note:"Definitions only; runtime availability is not implied"});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"FEATURE_IMPORT_UNAVAILABLE"},{status:503});}
 finally{db.release();}
}
