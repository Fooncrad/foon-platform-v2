import {createHash} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
export async function GET(_req:Request,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;if(!/^[A-Za-z0-9_-]{32,80}$/.test(token))return NextResponse.json({ok:false},{status:404});
 try{
  const [screens]=await database().execute<RowDataPacket[]>("SELECT s.id,s.name,s.refresh_seconds,s.paused,s.qr_enabled,s.qr_position,s.qr_size,s.qr_foreground,s.qr_background,s.display_layout,s.public_link_enabled,t.slug FROM display_screens s JOIN tenants t ON t.id=s.tenant_id AND t.status='active' WHERE s.token_hash=? AND s.enabled=TRUE LIMIT 1",[hash(token)]);
  if(!screens.length||screens[0].paused)return NextResponse.json({ok:false,paused:Boolean(screens[0]?.paused)},{status:404,headers:{"Cache-Control":"no-store"}});
  await database().execute("UPDATE display_screens SET last_seen_at=UTC_TIMESTAMP() WHERE id=?",[screens[0].id]);
  const [slides]=await database().execute<RowDataPacket[]>("SELECT id,media_url,external_video_url,video_loop,transition_effect,badge_text,title_ar,title_en,title_fr,subtitle_ar,subtitle_en,subtitle_fr,duration_seconds,sort_order FROM display_slides WHERE screen_id=? AND enabled=TRUE AND (starts_at IS NULL OR starts_at<=UTC_TIMESTAMP()) AND (ends_at IS NULL OR ends_at>UTC_TIMESTAMP()) ORDER BY sort_order,created_at",[screens[0].id]);
  return NextResponse.json({ok:true,screen:{id:screens[0].id,name:screens[0].name,refreshSeconds:screens[0].refresh_seconds,qrEnabled:Boolean(screens[0].qr_enabled),qrUrl:new URL(_req.url).origin+'/'+String(screens[0].slug),qrPosition:screens[0].qr_position,qrSize:screens[0].qr_size,qrForeground:screens[0].qr_foreground,qrBackground:screens[0].qr_background,displayLayout:screens[0].display_layout},slides},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({ok:false},{status:503,headers:{"Cache-Control":"no-store"}});}
}
