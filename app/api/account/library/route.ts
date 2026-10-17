import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {assetInUse} from "@/lib/media/asset-use";
import {randomUUID} from "node:crypto";
import {squareImage} from "@/lib/media/square-image";
import {NextResponse} from "next/server";
import {currentUserId} from "@/lib/auth/session";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
import {mediaPolicy,mediaUsage,assertMediaSpace} from "@/lib/media/account-quota";
import type {RowDataPacket} from "mysql2/promise";
export const runtime="nodejs";
export async function GET(){
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
 const id=await currentUserId();if(!id)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{const policy=await mediaPolicy(id);const [files]=await database().execute<RowDataPacket[]>("SELECT id,file_name,size_bytes,created_at FROM user_media_library WHERE user_id=? ORDER BY created_at DESC LIMIT 10000",[id]);const [assets]=await database().execute<RowDataPacket[]>("SELECT a.id,CONCAT(t.name,' · ',LEFT(a.id,8),'.jpg') AS file_name,a.size_bytes,a.created_at FROM restaurant_assets a JOIN tenants t ON t.id=a.tenant_id WHERE EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=a.tenant_id AND m.user_id=? AND m.role='owner' AND m.status='active') ORDER BY a.created_at DESC LIMIT 10000",[id]);files.push(...assets);return NextResponse.json({ok:true,policy,usage:await mediaUsage(database(),id),files:files.map(f=>({id:f.id,name:f.file_name,size:Number(f.size_bytes),createdAt:f.created_at}))});}catch{return NextResponse.json({ok:false,code:"LIBRARY_UNAVAILABLE"},{status:503});}
}
export async function POST(request:Request){
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const userId=await currentUserId();if(!userId)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const size=Number(request.headers.get("content-length")??0);if(size>11*1024*1024)return NextResponse.json({ok:false,code:"IMAGE_TOO_LARGE"},{status:413});
 const form=await request.formData().catch(()=>null),file=form?.get("file");
 if(!(file instanceof File)||file.size<1)return NextResponse.json({ok:false,code:"INVALID_IMAGE"},{status:400});
 try{
  const policy=await mediaPolicy(userId);
  if(!policy.enabled)return NextResponse.json({ok:false,code:"LIBRARY_DISABLED"},{status:403});
  if(file.size>policy.maxFileMb*1024*1024)return NextResponse.json({ok:false,code:"IMAGE_TOO_LARGE"},{status:413});
  const bytes=Buffer.from(await file.arrayBuffer());
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const webp=bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
  const mime=png?"image/png":jpg?"image/jpeg":webp?"image/webp":null;
  if(!mime||file.type!==mime)return NextResponse.json({ok:false,code:"INVALID_IMAGE"},{status:400});
  const square=await squareImage(bytes);
  if(square.length>policy.maxFileMb*1024*1024)return NextResponse.json({ok:false,code:"IMAGE_TOO_LARGE"},{status:413});
  const db=await database().getConnection();
  try{await db.beginTransaction();
   const [users]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? FOR UPDATE",[userId]);
   if(!users.length){await db.rollback();return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});}
   await assertMediaSpace(db,userId,square.length);
   const id=randomUUID();await db.execute("INSERT INTO user_media_library(id,user_id,file_name,mime_type,image_data,size_bytes) VALUES (?,?,?,?,?,?)",[id,userId,file.name.slice(0,180),"image/jpeg",square,square.length]);await db.commit();return NextResponse.json({ok:true,id},{status:201});
  }catch(error){await db.rollback();throw error}finally{db.release()}
 }catch(error){const code=error instanceof Error?error.message:"LIBRARY_UNAVAILABLE";return NextResponse.json({ok:false,code:["STORAGE_LIMIT_REACHED","LIBRARY_DISABLED","IMAGE_TOO_LARGE","INVALID_IMAGE"].includes(code)?code:"LIBRARY_UNAVAILABLE"},{status:["STORAGE_LIMIT_REACHED","LIBRARY_DISABLED"].includes(code)?409:code==="IMAGE_TOO_LARGE"?413:code==="INVALID_IMAGE"?400:503})}
}
export async function DELETE(request:Request){
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const userId=await currentUserId();if(!userId)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const data=await request.json().catch(()=>null);if(typeof data?.id!=="string"||!/^[0-9a-f-]{36}$/i.test(data.id))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();try{await db.beginTransaction();const [assets]=await db.execute<RowDataPacket[]>("SELECT a.tenant_id FROM restaurant_assets a WHERE a.id=? AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=a.tenant_id AND m.user_id=? AND m.role='owner' AND m.status='active')",[data.id,userId]);if(assets.length){const tenant=String(assets[0].tenant_id);await db.execute("SELECT id FROM tenants WHERE id=? FOR UPDATE",[tenant]);if(await assetInUse(db,tenant,data.id)){await db.rollback();return NextResponse.json({ok:false,code:"IMAGE_IN_USE"},{status:409});}await db.execute("DELETE FROM restaurant_assets WHERE tenant_id=? AND id=?",[tenant,data.id]);}else await db.execute("DELETE FROM user_media_library WHERE id=? AND user_id=?",[data.id,userId]);await db.commit();return NextResponse.json({ok:true})}catch{await db.rollback();return NextResponse.json({ok:false,code:"LIBRARY_UNAVAILABLE"},{status:503})}finally{db.release()}
}
