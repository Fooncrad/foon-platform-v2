import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {currentUserId} from "@/lib/auth/session";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
import {mediaPolicy} from "@/lib/media/account-quota";
import type {RowDataPacket} from "mysql2/promise";
export const runtime="nodejs";
export async function GET(){
 const id=await currentUserId();if(!id)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{const policy=await mediaPolicy(id);const [files]=await database().execute<RowDataPacket[]>("SELECT id,file_name,size_bytes,created_at FROM user_media_library WHERE user_id=? ORDER BY created_at DESC LIMIT 1000",[id]);return NextResponse.json({ok:true,policy,files:files.map(f=>({id:f.id,name:f.file_name,size:Number(f.size_bytes),createdAt:f.created_at}))});}catch{return NextResponse.json({ok:false,code:"LIBRARY_UNAVAILABLE"},{status:503});}
}
export async function POST(request:Request){
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
  const db=await database().getConnection();
  try{await db.beginTransaction();
   const [users]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? FOR UPDATE",[userId]);
   if(!users.length){await db.rollback();return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});}
   const [[usage]]=await db.execute<RowDataPacket[]>("SELECT COUNT(*) AS total,COALESCE(SUM(size_bytes),0) AS bytes FROM user_media_library WHERE user_id=?",[userId]);
   if(Number(usage.total)>=policy.maxFiles||Number(usage.bytes)+file.size>policy.maxStorageMb*1024*1024){await db.rollback();return NextResponse.json({ok:false,code:"STORAGE_LIMIT_REACHED"},{status:409});}
   const id=randomUUID();await db.execute("INSERT INTO user_media_library(id,user_id,file_name,mime_type,image_data,size_bytes) VALUES (?,?,?,?,?,?)",[id,userId,file.name.slice(0,180),mime,bytes,bytes.length]);await db.commit();return NextResponse.json({ok:true,id},{status:201});
  }catch{await db.rollback();throw Error("SAVE_FAILED")}finally{db.release()}
 }catch{return NextResponse.json({ok:false,code:"LIBRARY_UNAVAILABLE"},{status:503})}
}
export async function DELETE(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const userId=await currentUserId();if(!userId)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const data=await request.json().catch(()=>null);if(typeof data?.id!=="string"||!/^[0-9a-f-]{36}$/i.test(data.id))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{await database().execute("DELETE FROM user_media_library WHERE id=? AND user_id=?",[data.id,userId]);return NextResponse.json({ok:true})}catch{return NextResponse.json({ok:false,code:"LIBRARY_UNAVAILABLE"},{status:503})}
}
