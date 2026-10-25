import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {NextResponse} from "next/server";
import {createHash} from "node:crypto";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";

export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store"};
const fail=(code:string,status:number)=>NextResponse.json({code},{status,headers});
export async function GET(){
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
 const userId=await currentUserId();
 if(!userId)return fail("UNAUTHORIZED",401);
 try{
  const db=database();
  // A valid cookie must not expose order, reservation or notification metadata
  // after the customer account is frozen or deleted.
  const [active]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status='active' LIMIT 1",[userId]);
  if(!active.length)return fail("UNAUTHORIZED",401);
  // Repeat the active-user predicate in each read to fail closed if the
  // account status changes while the revision is being assembled.
  const [rows]=await db.execute<RowDataPacket[]>(
   "SELECT id,status,payment_status,total,updated_at FROM restaurant_orders WHERE customer_user_id=? AND EXISTS (SELECT 1 FROM users WHERE id=? AND status='active') ORDER BY created_at DESC LIMIT 100",
   [userId,userId]
  );
  let reservations:RowDataPacket[]=[];
  let reservationsAvailable=true;
  try{
   const [linked]=await db.execute<RowDataPacket[]>(
    "SELECT id,status,version,created_at FROM restaurant_resources WHERE kind='reservation' AND archived=FALSE AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.customerUserId'))=? AND EXISTS (SELECT 1 FROM users WHERE id=? AND status='active') ORDER BY created_at DESC LIMIT 50",
    [userId,userId]
   );
   reservations=linked;
  }catch(error){
   reservationsAvailable=false;
   console.error("CUSTOMER_RESERVATION_REVISION_UNAVAILABLE",error);
  }
  const [notifications]=await db.execute<RowDataPacket[]>("SELECT id,read_at FROM customer_notifications WHERE user_id=? AND EXISTS (SELECT 1 FROM users WHERE id=? AND status='active') ORDER BY created_at DESC,id DESC LIMIT 30",[userId,userId]);
  const [[counts]]=await db.execute<RowDataPacket[]>("SELECT COUNT(*) AS total,COALESCE(SUM(read_at IS NULL),0) AS unread FROM customer_notifications WHERE user_id=? AND EXISTS (SELECT 1 FROM users WHERE id=? AND status='active')",[userId,userId]);
  const revision=createHash("sha256").update(JSON.stringify({notificationCounts:[Number(counts.total),Number(counts.unread)],notifications:notifications.map(n=>[n.id,n.read_at]),orders:rows.map(row=>[row.id,row.status,row.payment_status,String(row.total),String(row.updated_at)]),reservations:reservations.map(row=>[row.id,row.status,row.version])})).digest("hex");
  return NextResponse.json({revision,reservationsAvailable,notificationId:notifications[0]?.id??null,unread:Number(counts.unread)},{headers});
 }catch{
  return fail("CUSTOMER_ACTIVITY_UNAVAILABLE",503);
 }
}
