import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {createHash} from "node:crypto";
import {database} from "@/lib/db/mysql";
import {readCookie,verifyKioskSession} from "@/lib/display/kiosk-security";
import {createDisplayRealtimeTicket} from "@/lib/display/realtime";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
export async function GET(req:Request,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;
 if(!/^[A-Za-z0-9_-]{32,80}$/.test(token))return NextResponse.json({ok:false},{status:404});
 const wsUrl=process.env.NEXT_PUBLIC_FOON_DISPLAY_REALTIME_URL??"";
 if(!/^wss:\/\//i.test(wsUrl))return NextResponse.json({ok:false,code:"REALTIME_NOT_CONFIGURED"},{status:503,headers:{"Cache-Control":"no-store"}});
 try{
  const [rows]=await database().execute<RowDataPacket[]>("SELECT id,tenant_id,kiosk_pin_hash FROM display_screens WHERE token_hash=? AND enabled=TRUE AND paused=FALSE LIMIT 1",[hash(token)]);
  if(!rows.length)return NextResponse.json({ok:false},{status:404});
  const pinHash=rows[0].kiosk_pin_hash;
  if(pinHash&&!verifyKioskSession(token,String(pinHash),readCookie(req,"foon_display_kiosk")))return NextResponse.json({ok:false,code:"KIOSK_AUTH_REQUIRED"},{status:401});
  const ticket=createDisplayRealtimeTicket({screenId:String(rows[0].id),tenantId:String(rows[0].tenant_id)});
  return NextResponse.json({ok:true,url:wsUrl,ticket},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({ok:false,code:"REALTIME_UNAVAILABLE"},{status:503,headers:{"Cache-Control":"no-store"}});}
}
