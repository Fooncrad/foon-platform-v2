import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const actor=await currentActiveAdminUserId();
 if(!actor)return new Response(null,{status:401});
 try{await requirePlatformRole(actor,["super_admin","admin"]);}catch{return new Response(null,{status:403});}
 const {id}=await params;
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return new Response(null,{status:404});
 try{
  const [rows]=await database().execute<RowDataPacket[]>(
   "SELECT e.mime_type,e.contents FROM platform_payment_transfer_evidence e "+
   "JOIN platform_payment_requests r ON r.id=e.payment_request_id WHERE e.payment_request_id=? LIMIT 1",[id]);
  if(!rows.length)return new Response(null,{status:404,headers:{"Cache-Control":"no-store"}});
  const mime=String(rows[0].mime_type);
  const ext=mime==="image/png"?"png":mime==="image/jpeg"?"jpg":"pdf";
  return new Response(new Uint8Array(rows[0].contents as Buffer),{headers:{
   "Content-Type":mime,"Cache-Control":"private, no-store",
   "Content-Disposition":'attachment; filename="foon-payment-evidence.'+ext+'"',
   "X-Content-Type-Options":"nosniff",
   "Content-Security-Policy":"default-src 'none'; sandbox"
  }});
 }catch{return new Response(null,{status:503,headers:{"Cache-Control":"no-store"}});}
}
