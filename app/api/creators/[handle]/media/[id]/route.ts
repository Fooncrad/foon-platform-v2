import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {validCreatorHandle} from "@/lib/creator/profile-policy";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(_request:Request,{params}:{params:Promise<{handle:string;id:string}>}){
 const {handle,id}=await params;
 if(!validCreatorHandle(handle)||!uuid.test(id))return new Response(null,{status:404});
 try{
  const [rows]=await database().execute<RowDataPacket[]>(
   "SELECT m.image_data,m.mime_type FROM customer_creator_portfolio cp "+
   "JOIN customer_creator_profiles p ON p.user_id=cp.user_id "+
   "JOIN users u ON u.id=p.user_id AND u.status='active' "+
   "JOIN user_media_library m ON m.id=cp.media_id AND m.user_id=cp.user_id "+
   "WHERE cp.id=? AND p.handle=? AND p.visibility='public' "+
   "AND NOT EXISTS (SELECT 1 FROM memberships mb WHERE mb.user_id=p.user_id) "+
   "AND NOT EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id=p.user_id) LIMIT 1",
   [id,handle]);
  if(!rows.length)return new Response(null,{status:404,headers:{"Cache-Control":"no-store"}});
  return new Response(new Uint8Array(rows[0].image_data as Buffer),{headers:{"Content-Type":"image/jpeg","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
 }catch{return new Response(null,{status:503,headers:{"Cache-Control":"no-store"}});}
}
