import {createHash} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
import {createKioskSession,readCookie,verifyKioskPin,verifyKioskSession} from "@/lib/display/kiosk-security";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
export async function GET(_req:Request,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;if(!/^[A-Za-z0-9_-]{32,80}$/.test(token))return NextResponse.json({ok:false},{status:404});
 try{
  const [screens]=await database().execute<RowDataPacket[]>("SELECT s.id,s.name,s.refresh_seconds,s.paused,s.kiosk_pin_salt,s.kiosk_pin_hash,s.qr_enabled,s.qr_position,s.qr_size,s.qr_foreground,s.qr_background,s.display_layout,t.slug FROM display_screens s JOIN tenants t ON t.id=s.tenant_id AND t.status='active' WHERE s.token_hash=? AND s.enabled=TRUE LIMIT 1",[hash(token)]);
  if(!screens.length||screens[0].paused)return NextResponse.json({ok:false,paused:Boolean(screens[0]?.paused)},{status:404,headers:{"Cache-Control":"no-store"}});
  const protectedByPin=Boolean(screens[0].kiosk_pin_hash);
  if(protectedByPin&&!verifyKioskSession(token,String(screens[0].kiosk_pin_hash),readCookie(_req,"foon_display_kiosk"))){
   return NextResponse.json({ok:false,kioskProtected:true},{status:401,headers:{"Cache-Control":"no-store"}});
  }
  await database().execute("UPDATE display_screens SET last_seen_at=UTC_TIMESTAMP() WHERE id=?",[screens[0].id]);
  const campaignKey=new URL(_req.url).searchParams.get("campaign")??"";
  const safeCampaignKey=/^[a-z0-9_-]{1,80}$/i.test(campaignKey)?campaignKey:"";
  const [slides]=await database().execute<RowDataPacket[]>("SELECT s.id,s.source_type,s.source_id,COALESCE(s.media_url,CASE WHEN s.source_type='restaurant_menu_item' THEN mi.image_url WHEN s.source_type='catalog_product' THEN (SELECT ci.image_url FROM catalog_images ci WHERE ci.tenant_id=s.tenant_id AND ci.product_id=s.source_id ORDER BY ci.sort_order,ci.id LIMIT 1) END) AS media_url,s.external_video_url,s.video_loop,s.transition_effect,COALESCE(s.badge_text,CASE WHEN s.source_type='restaurant_menu_item' THEN CONCAT(FORMAT(mi.price,2),' ',mi.currency) WHEN s.source_type='catalog_product' THEN CONCAT(FORMAT(cp.price,2),' ',cp.currency) END) AS badge_text,s.campaign_match_key,COALESCE(s.title_ar,mi.name,cp.name_ar) AS title_ar,COALESCE(s.title_en,JSON_UNQUOTE(JSON_EXTRACT(mr.data,'$.nameEn')),cp.name_en) AS title_en,COALESCE(s.title_fr,JSON_UNQUOTE(JSON_EXTRACT(mr.data,'$.nameFr')),cp.name_fr) AS title_fr,COALESCE(s.subtitle_ar,mi.description,cp.description_ar) AS subtitle_ar,COALESCE(s.subtitle_en,cp.description_en) AS subtitle_en,COALESCE(s.subtitle_fr,cp.description_fr) AS subtitle_fr,s.duration_seconds,s.sort_order FROM display_slides s LEFT JOIN restaurant_menu_items mi ON s.source_type='restaurant_menu_item' AND mi.id=s.source_id AND mi.tenant_id=s.tenant_id AND mi.enabled=TRUE LEFT JOIN restaurant_resources mr ON mr.id=mi.id AND mr.tenant_id=mi.tenant_id AND mr.kind='menu_item' LEFT JOIN catalog_products cp ON s.source_type='catalog_product' AND cp.id=s.source_id AND cp.tenant_id=s.tenant_id AND cp.enabled=TRUE AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(cp.attributes,'$.__foon_archived')),'0') NOT IN ('1','true') WHERE s.screen_id=? AND s.enabled=TRUE AND (s.campaign_match_key IS NULL OR s.campaign_match_key=?) AND (s.starts_at IS NULL OR s.starts_at<=UTC_TIMESTAMP()) AND (s.ends_at IS NULL OR s.ends_at>UTC_TIMESTAMP()) ORDER BY s.sort_order,s.created_at",[screens[0].id,safeCampaignKey]);
  return NextResponse.json({ok:true,screen:{id:screens[0].id,name:screens[0].name,kioskProtected:protectedByPin,refreshSeconds:screens[0].refresh_seconds,qrEnabled:Boolean(screens[0].qr_enabled),qrUrl:new URL(_req.url).origin+'/'+String(screens[0].slug),qrPosition:screens[0].qr_position,qrSize:screens[0].qr_size,qrForeground:screens[0].qr_foreground,qrBackground:screens[0].qr_background,displayLayout:screens[0].display_layout},slides},{headers:{"Cache-Control":"no-store",...(protectedByPin?{}:{"X-FOON-Display-Offline":"public"})}});
 }catch{return NextResponse.json({ok:false},{status:503,headers:{"Cache-Control":"no-store"}});}
}

export async function POST(req:Request,{params}:{params:Promise<{token:string}>}){
 try{assertSameOrigin(req);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const {token}=await params;
 if(!/^[A-Za-z0-9_-]{32,80}$/.test(token))return NextResponse.json({ok:false},{status:404});
 let body:Record<string,unknown>;
 try{body=await readLimitedJson(req,1024) as Record<string,unknown>;}catch{return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});}
 const pin=typeof body.pin==="string"?body.pin.trim():"";
 if(!/^\d{4,8}$/.test(pin))return NextResponse.json({ok:false,code:"INVALID_KIOSK_PIN"},{status:400});
 try{
  const [rows]=await database().execute<RowDataPacket[]>("SELECT id,kiosk_pin_salt,kiosk_pin_hash,kiosk_failed_attempts,kiosk_locked_until FROM display_screens WHERE token_hash=? AND enabled=TRUE LIMIT 1",[hash(token)]);
  if(!rows.length||!rows[0].kiosk_pin_hash)return NextResponse.json({ok:false,code:"KIOSK_NOT_ENABLED"},{status:404});
  if(rows[0].kiosk_locked_until&&new Date(rows[0].kiosk_locked_until).getTime()>Date.now())return NextResponse.json({ok:false,code:"KIOSK_TEMPORARILY_LOCKED"},{status:429});
  const valid=verifyKioskPin(pin,String(rows[0].kiosk_pin_salt),String(rows[0].kiosk_pin_hash));
  if(!valid){
   const attempts=Number(rows[0].kiosk_failed_attempts??0)+1;
   await database().execute("UPDATE display_screens SET kiosk_failed_attempts=?,kiosk_locked_until=IF(? >= 5,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE),NULL) WHERE id=?",[attempts,attempts,rows[0].id]);
   return NextResponse.json({ok:false,code:attempts>=5?"KIOSK_TEMPORARILY_LOCKED":"INVALID_KIOSK_PIN"},{status:attempts>=5?429:401});
  }
  await database().execute("UPDATE display_screens SET kiosk_failed_attempts=0,kiosk_locked_until=NULL WHERE id=?",[rows[0].id]);
  const session=createKioskSession(token,String(rows[0].kiosk_pin_hash));
  const cookie="foon_display_kiosk="+encodeURIComponent(session.value)+"; HttpOnly; Secure; SameSite=Strict; Path=/api/display/"+encodeURIComponent(token)+"; Max-Age="+session.maxAge;
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store","Set-Cookie":cookie}});
 }catch{return NextResponse.json({ok:false,code:"KIOSK_VERIFY_FAILED"},{status:503});}
}
