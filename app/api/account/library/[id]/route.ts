import {NextResponse} from "next/server";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const userId=await currentUserId();if(!userId)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))return new Response(null,{status:404});
 try{const [rows]=await database().execute<RowDataPacket[]>("SELECT image_data,mime_type FROM user_media_library WHERE id=? AND user_id=? LIMIT 1",[id,userId]);if(!rows.length)return new Response(null,{status:404});return new Response(new Uint8Array(rows[0].image_data as Buffer),{headers:{"content-type":String(rows[0].mime_type),"cache-control":"private, no-store","x-content-type-options":"nosniff"}})}catch{return NextResponse.json({ok:false,code:"LIBRARY_UNAVAILABLE"},{status:503})}
}
