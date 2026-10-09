import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {validStoreSlug} from "@/scripts/store-slug.mjs";
export const runtime="nodejs";
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const body=await request.json().catch(()=>null);if(!validStoreSlug(body?.storeSlug))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [stores]=await db.execute<RowDataPacket[]>("SELECT t.id FROM tenants t JOIN users u ON u.id=? AND u.status='active' WHERE t.slug=? AND t.status='active' LIMIT 1 LOCK IN SHARE MODE",[user,body.storeSlug]);
  if(!stores.length){await db.rollback();return NextResponse.json({ok:false,code:"STORE_NOT_FOUND"},{status:404});}
  await db.execute("INSERT IGNORE INTO tenant_customers(tenant_id,user_id) VALUES (?,?)",[stores[0].id,user]);await db.commit();return NextResponse.json({ok:true});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"JOIN_UNAVAILABLE"},{status:503});}finally{db.release();}
}
