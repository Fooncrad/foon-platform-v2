import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!/^[a-f0-9-]{36}$/i.test(id))return new NextResponse(null,{status:404});
 const [rows]=await database().execute<RowDataPacket[]>("SELECT a.mime_type,a.bytes FROM restaurant_assets a JOIN tenants t ON t.id=a.tenant_id AND t.status='active' WHERE a.id=? LIMIT 1",[id]);
 if(!rows.length)return new NextResponse(null,{status:404});
 return new NextResponse(new Uint8Array(rows[0].bytes),{headers:{"content-type":String(rows[0].mime_type),"cache-control":"public,max-age=86400","x-content-type-options":"nosniff"}});
}
