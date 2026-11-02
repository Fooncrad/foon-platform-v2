import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";

export async function PATCH(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const id=await currentUserId();
 if(!id)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const body=await request.json().catch(()=>null);
 if(!["ar","en","fr"].includes(body?.language))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [users]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status='active' LIMIT 1 FOR UPDATE",[id]);
  if(!users.length){
   await db.rollback();
   return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
  }
  await db.execute("UPDATE users SET default_locale=? WHERE id=? AND status='active'",[body.language,id]);
  await db.commit();
  return NextResponse.json({ok:true});
 }catch{
  await db.rollback().catch(()=>{});
  return NextResponse.json({ok:false,code:"LANGUAGE_UNAVAILABLE"},{status:503});
 }finally{db.release();}
}
