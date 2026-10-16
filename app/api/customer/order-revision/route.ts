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
  let reservations:RowDataPacket[]=[];
  let reservationsAvailable=true;
  try{
   const [linked]=await database().execute<RowDataPacket[]>(
    "SELECT id,status,version,created_at FROM restaurant_resources WHERE kind='reservation' AND archived=FALSE AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.customerUserId'))=? ORDER BY created_at DESC LIMIT 50",
    [userId]
   );
   reservations=linked;
  }catch(error){
   reservationsAvailable=false;
   console.error("CUSTOMER_RESERVATION_REVISION_UNAVAILABLE",error);
  }
  const [notifications]=await database().execute<RowDataPacket[]>("SELECT id,read_at FROM customer_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30",[userId]);
  const revision=createHash("sha256").update(JSON.stringify({notifications:notifications.map(n=>[n.id,n.read_at]),orders:rows.map(row=>[row.id,row.status,row.payment_status,String(row.total),String(row.updated_at)]),reservations:reservations.map(row=>[row.id,row.status,row.version])})).digest("hex");
  return NextResponse.json({revision,reservationsAvailable,notificationId:notifications[0]?.id??null,unread:notifications.filter(n=>!n.read_at).length},{headers:{"Cache-Control":"no-store, private"}});
 }catch{
  return NextResponse.json({code:"CUSTOMER_ACTIVITY_UNAVAILABLE"},{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
