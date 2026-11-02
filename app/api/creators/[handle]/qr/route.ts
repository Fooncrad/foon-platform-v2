import QRCode from "qrcode";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {validCreatorHandle} from "@/lib/creator/profile-policy";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
function publicCreatorUrl(handle:string):string{
 // Use configured application canonical origin rather than untrusted Host headers.
 const fallback="https://nfoodz.com";
 const origin=process.env.APP_URL??fallback;
 const base=new URL(origin);
 if(!["http:","https:"].includes(base.protocol))throw new Error("INVALID_APP_URL");
 return new URL("/creators/"+encodeURIComponent(handle),base.origin).toString();
}
export async function GET(_request:Request,{params}:{params:Promise<{handle:string}>}){
 const {handle}=await params;
 if(!validCreatorHandle(handle))return new Response(null,{status:404,headers:noStore});
 try{
  const [profiles]=await database().execute<RowDataPacket[]>(
   "SELECT p.user_id FROM customer_creator_profiles p "+
   "JOIN users u ON u.id=p.user_id AND u.status='active' "+
   "WHERE p.handle=? AND p.visibility='public' "+
   "AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=p.user_id) "+
   "AND NOT EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id=p.user_id) LIMIT 1",
   [handle]);
  if(!profiles.length)return new Response(null,{status:404,headers:noStore});
  const svg=await QRCode.toString(publicCreatorUrl(handle),{
   type:"svg",errorCorrectionLevel:"H",margin:3,width:360,
   color:{dark:"#171613",light:"#ffffff"}
  });
  return new Response(svg,{headers:{"Content-Type":"image/svg+xml; charset=utf-8",...noStore,
   "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; sandbox",
   "Content-Disposition":'inline; filename="foon-creator-qr.svg"'}});
 }catch{return new Response(null,{status:503,headers:noStore});}
}
