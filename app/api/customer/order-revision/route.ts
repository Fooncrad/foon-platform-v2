import {NextResponse} from "next/server";
import {createHash} from "node:crypto";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";

export const runtime="nodejs";
export async function GET(){
 const userId=await currentUserId();
 if(!userId)return NextResponse.json({code:"UNAUTHORIZED"},{status:401,headers:{"Cache-Control":"no-store"}});
 try{
  const [rows]=await database().execute<RowDataPacket[]>(
   "SELECT id,status,payment_status,total,updated_at FROM restaurant_orders WHERE customer_user_id=? ORDER BY created_at DESC LIMIT 100",
   [userId]
  );
  const revision=createHash("sha256").update(JSON.stringify(rows.map(row=>[row.id,row.status,row.payment_status,String(row.total),String(row.updated_at)]))).digest("hex");
  return NextResponse.json({revision},{headers:{"Cache-Control":"no-store, private"}});
 }catch{
  return NextResponse.json({code:"ORDER_STATUS_UNAVAILABLE"},{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
