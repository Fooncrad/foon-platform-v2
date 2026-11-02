import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {validCreatorHandle} from "@/lib/creator/profile-policy";
import {publicCreatorImageMime} from "@/lib/creator/image-policy";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{handle:string}>}){
 const {handle}=await params;
 const type=new URL(request.url).searchParams.get("type")==="cover"?"cover":"avatar";
 const column=type==="cover"?"cover_image":"avatar_image";
 const mimeColumn=type==="cover"?"cover_mime":"avatar_mime";
 if(!validCreatorHandle(handle))return new Response(null,{status:404});
 try{
  const [rows]=await database().execute<RowDataPacket[]>(
   `SELECT up.${column} AS image,up.${mimeColumn} AS mime FROM customer_creator_profiles p `+
   "JOIN users u ON u.id=p.user_id AND u.status='active' "+
   "JOIN user_profiles up ON up.user_id=p.user_id "+
   "WHERE p.handle=? AND p.visibility='public' "+
   "AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=p.user_id) "+
   "AND NOT EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id=p.user_id) LIMIT 1",[handle]);
  if(!rows.length||!rows[0].image)return new Response(null,{status:404,headers:{"Cache-Control":"no-store"}});
  const mime=publicCreatorImageMime(rows[0].mime);
  if(!mime)return new Response(null,{status:404,headers:{"Cache-Control":"no-store"}});
  return new Response(new Uint8Array(rows[0].image as Buffer),{headers:{"Content-Type":mime,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
 }catch{return new Response(null,{status:503,headers:{"Cache-Control":"no-store"}});}
}
