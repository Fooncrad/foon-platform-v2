import {randomBytes,randomUUID,createHash} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
import {requireAllAdditionalBranchesUnlocked} from "@/lib/restaurant/branch-pin";
import {tenantEntitlement} from "@/lib/plans/entitlements";
import {createKioskPinRecord} from "@/lib/display/kiosk-security";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
const digest=(token:string)=>createHash("sha256").update(token).digest("hex");
async function context(req:Request,write=false){
 const user=await currentUserId();if(!user)throw Object.assign(new Error("UNAUTHENTICATED"),{status:401});
 const tenant=req.headers.get("x-foon-tenant")??"";if(!tenant)throw Object.assign(new Error("TENANT_REQUIRED"),{status:400});
 let member;try{member=await requireTenantMembership(user,tenant,["owner","manager"],write);}catch{throw Object.assign(new Error("FORBIDDEN"),{status:403});}
 if(!(await tenantEntitlement(tenant,"campaigns")).enabled)throw Object.assign(new Error("PLAN_FEATURE_REQUIRED"),{status:403});
 if(write)await requireAllAdditionalBranchesUnlocked(member.tenantId,user);
 return {user,tenant:member.tenantId};
}
function fail(e:unknown){const status=Number((e as {status?:number})?.status)||503;return reply({ok:false,code:e instanceof Error?e.message:"DISPLAY_UNAVAILABLE"},status);}
export async function GET(req:Request){
 let ctx;try{ctx=await context(req);}catch(e){return fail(e);}
 try{
  const [screens]=await database().execute<RowDataPacket[]>("SELECT id,name,branch_id,refresh_seconds,enabled,paused,qr_enabled,qr_position,qr_size,qr_foreground,qr_background,display_layout,kiosk_pin_hash,last_seen_at,CASE WHEN last_seen_at>=UTC_TIMESTAMP()-INTERVAL 60 SECOND THEN TRUE ELSE FALSE END AS is_online,created_at FROM display_screens WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100",[ctx.tenant]);
  const ids=screens.map(x=>String(x.id));let slides:RowDataPacket[]=[];
  if(ids.length){const marks=ids.map(()=>"?").join(",");const [rows]=await database().execute<RowDataPacket[]>("SELECT id,screen_id,media_url,external_video_url,video_loop,transition_effect,badge_text,campaign_match_key,title_ar,title_en,title_fr,subtitle_ar,subtitle_en,subtitle_fr,duration_seconds,sort_order,starts_at,ends_at,enabled FROM display_slides WHERE tenant_id=? AND screen_id IN ("+marks+") ORDER BY sort_order,created_at",[ctx.tenant,...ids]);slides=rows;}
  return reply({ok:true,screens:screens.map(s=>({...s,kiosk_protected:Boolean(s.kiosk_pin_hash),kiosk_pin_hash:undefined,slides:slides.filter(x=>x.screen_id===s.id)}))});
 }catch{return reply({ok:false,code:"DISPLAY_LIST_FAILED"},503);}
}
export async function POST(req:Request){
 try{assertSameOrigin(req);}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 let ctx;try{ctx=await context(req,true);}catch(e){return fail(e);}
 let body:Record<string,unknown>;try{body=await readLimitedJson(req,8192) as Record<string,unknown>;}catch{return reply({ok:false,code:"INVALID_INPUT"},400);}
 const action=body?.action;
 try{
  if(action==="kioskPin"){
   if(typeof body.screenId!=="string"||typeof body.pin!=="string"||body.pin.length>8)return reply({ok:false,code:"INVALID_INPUT"},400);
   const pin=body.pin.trim();
   if(pin!==""&&!/^\d{4,8}$/.test(pin))return reply({ok:false,code:"INVALID_KIOSK_PIN"},400);
   const record=pin?createKioskPinRecord(pin):null;
   const [result]=await database().execute("UPDATE display_screens SET kiosk_pin_salt=?,kiosk_pin_hash=?,kiosk_failed_attempts=0,kiosk_locked_until=NULL WHERE id=? AND tenant_id=?",[record?.salt??null,record?.hash??null,body.screenId,ctx.tenant]);
   if(Number((result as {affectedRows?:number}).affectedRows??0)!==1)return reply({ok:false,code:"SCREEN_NOT_FOUND"},404);
   return reply({ok:true,enabled:Boolean(record)});
  }
  if(action==="rotate"){
   if(typeof body.screenId!=="string")return reply({ok:false,code:"INVALID_INPUT"},400);
   const token=randomBytes(32).toString("base64url");
   const [result]=await database().execute("UPDATE display_screens SET token_hash=? WHERE id=? AND tenant_id=?",[digest(token),body.screenId,ctx.tenant]);
   if(Number((result as {affectedRows?:number}).affectedRows??0)!==1)return reply({ok:false,code:"SCREEN_NOT_FOUND"},404);
   return reply({ok:true,token});
  }
  if(action==="screen"){
   if(typeof body.name!=="string"||!body.name.trim()||body.name.length>120)return reply({ok:false,code:"INVALID_NAME"},400);
   const branch=typeof body.branchId==="string"&&body.branchId?body.branchId:null;
   if(branch){const [b]=await database().execute<RowDataPacket[]>("SELECT id FROM branches WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[branch,ctx.tenant]);if(!b.length)return reply({ok:false,code:"BRANCH_NOT_FOUND"},404);}
   const id=randomUUID(),token=randomBytes(32).toString("base64url");
   await database().execute("INSERT INTO display_screens(id,tenant_id,branch_id,name,token_hash,created_by) VALUES (?,?,?,?,?,?)",[id,ctx.tenant,branch,body.name.trim(),digest(token),ctx.user]);
   return reply({ok:true,id,token},201);
  }
  if(action==="slide"){
   if(typeof body.screenId!=="string")return reply({ok:false,code:"INVALID_INPUT"},400);
   const mediaUrl=typeof body.mediaUrl==="string"&&/^\/api\/restaurant\/assets\/[a-f0-9-]{36}$/i.test(body.mediaUrl)?body.mediaUrl:null;
   const videoUrl=typeof body.videoUrl==="string"&&body.videoUrl.trim()?body.videoUrl.trim():null;
   if(Boolean(mediaUrl)===Boolean(videoUrl))return reply({ok:false,code:"INVALID_MEDIA"},400);
   if(videoUrl){try{const parsed=new URL(videoUrl);const host=parsed.hostname.toLowerCase();const privateHost=host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||host.includes(":")||/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);if(parsed.protocol!=="https:"||parsed.username||parsed.password||privateHost||! /\.(mp4|webm)$/i.test(parsed.pathname))return reply({ok:false,code:"INVALID_VIDEO_URL"},400);}catch{return reply({ok:false,code:"INVALID_VIDEO_URL"},400);}}
   const [screens]=await database().execute<RowDataPacket[]>("SELECT id FROM display_screens WHERE id=? AND tenant_id=? LIMIT 1",[body.screenId,ctx.tenant]);if(!screens.length)return reply({ok:false,code:"SCREEN_NOT_FOUND"},404);
   if(mediaUrl){const [assets]=await database().execute<RowDataPacket[]>("SELECT id FROM restaurant_assets WHERE id=? AND tenant_id=? LIMIT 1",[mediaUrl.slice("/api/restaurant/assets/".length),ctx.tenant]);if(!assets.length)return reply({ok:false,code:"MEDIA_NOT_FOUND"},404);}
   const duration=Math.max(5,Math.min(120,Number(body.durationSeconds)||10));
   const startsAt=body.startsAt==null||body.startsAt===""?null:typeof body.startsAt==="string"?body.startsAt:null;
   const endsAt=body.endsAt==null||body.endsAt===""?null:typeof body.endsAt==="string"?body.endsAt:null;
   const validDate=(value:string|null)=>value===null||(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)&&Number.isFinite(Date.parse(value.replace(" ","T")+"Z")));
   if(!validDate(startsAt)||!validDate(endsAt)||(startsAt&&endsAt&&Date.parse(endsAt.replace(" ","T")+"Z")<=Date.parse(startsAt.replace(" ","T")+"Z")))return reply({ok:false,code:"INVALID_SCHEDULE"},400);
   const [lastOrder]=await database().execute<RowDataPacket[]>("SELECT COALESCE(MAX(sort_order),-1)+1 AS next_order FROM display_slides WHERE screen_id=? AND tenant_id=?",[body.screenId,ctx.tenant]);
   const sortOrder=typeof body.sortOrder==="number"?Math.max(0,Math.min(10000,Math.floor(body.sortOrder))):Number(lastOrder[0]?.next_order??0);
   const id=randomUUID();
   const transition=["fade","zoom","slide","kenburns"].includes(String(body.transitionEffect))?String(body.transitionEffect):"fade";
   const badge=typeof body.badgeText==="string"?body.badgeText.trim().slice(0,64):null;
   const campaignKey=typeof body.campaignMatchKey==="string"?body.campaignMatchKey.trim().slice(0,80):"";
   if(campaignKey&&!/^[a-z0-9_-]{1,80}$/i.test(campaignKey))return reply({ok:false,code:"INVALID_CAMPAIGN_KEY"},400);
   await database().query("INSERT INTO display_slides(id,screen_id,tenant_id,media_url,external_video_url,video_loop,transition_effect,badge_text,campaign_match_key,title_ar,title_en,title_fr,subtitle_ar,subtitle_en,subtitle_fr,duration_seconds,sort_order,starts_at,ends_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,body.screenId,ctx.tenant,mediaUrl,videoUrl,body.videoLoop!==false,transition,badge,campaignKey||null,...(["titleAr","titleEn","titleFr","subtitleAr","subtitleEn","subtitleFr"].map(k=>typeof body[k]==="string"?String(body[k]).slice(0,k.startsWith("title")?180:500):null)),duration,sortOrder,startsAt,endsAt]);
   return reply({ok:true,id},201);
  }
  return reply({ok:false,code:"INVALID_ACTION"},400);
 }catch{return reply({ok:false,code:"DISPLAY_SAVE_FAILED"},503);}
}
export async function PATCH(req:Request){
 try{assertSameOrigin(req);}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 let ctx;try{ctx=await context(req,true);}catch(e){return fail(e);}
 let body:Record<string,unknown>;try{body=await readLimitedJson(req,4096) as Record<string,unknown>;}catch{return reply({ok:false,code:"INVALID_INPUT"},400);}
 if(typeof body?.id!=="string")return reply({ok:false,code:"INVALID_INPUT"},400);
 try{
  if(body.kind==="screen"){
   const allowed:Record<string,unknown>={};if(typeof body.name==="string"&&body.name.trim())allowed.name=body.name.trim().slice(0,120);
   if(typeof body.paused==="boolean")allowed.paused=body.paused;if(typeof body.enabled==="boolean")allowed.enabled=body.enabled;
   if(typeof body.qrEnabled==="boolean")allowed.qr_enabled=body.qrEnabled;
   if(["single","double","triple","quad","split"].includes(String(body.displayLayout)))allowed.display_layout=body.displayLayout;
   if(["top-left","top-right","bottom-left","bottom-right","center"].includes(String(body.qrPosition)))allowed.qr_position=body.qrPosition;
   if(body.qrSize!==undefined)allowed.qr_size=Math.max(80,Math.min(240,Number(body.qrSize)||140));
   if(typeof body.qrForeground==="string"&&/^#[0-9a-f]{6}$/i.test(body.qrForeground))allowed.qr_foreground=body.qrForeground;
   if(typeof body.qrBackground==="string"&&/^#[0-9a-f]{6}$/i.test(body.qrBackground))allowed.qr_background=body.qrBackground;
   if(body.refreshSeconds!==undefined)allowed.refresh_seconds=Math.max(5,Math.min(120,Number(body.refreshSeconds)||15));
   const entries=Object.entries(allowed);if(!entries.length)return reply({ok:false,code:"NO_CHANGES"},400);
   await database().query("UPDATE display_screens SET "+entries.map(([k])=>k+"=?").join(",")+" WHERE id=? AND tenant_id=?",[...entries.map(([,v])=>v),body.id,ctx.tenant]);
   return reply({ok:true});
  }
  if(body.kind==="slide"){
   if(body.move==="up"||body.move==="down"){
    const conn=await database().getConnection();
    try{await conn.beginTransaction();
     const [current]=await conn.execute<RowDataPacket[]>("SELECT id,screen_id,sort_order FROM display_slides WHERE id=? AND tenant_id=? FOR UPDATE",[body.id,ctx.tenant]);
     if(!current.length){await conn.rollback();return reply({ok:false,code:"SLIDE_NOT_FOUND"},404);}
     const direction=body.move==="up"?"<":">",order=body.move==="up"?"DESC":"ASC";
     const [neighbor]=await conn.query<RowDataPacket[]>("SELECT id,sort_order FROM display_slides WHERE screen_id=? AND tenant_id=? AND sort_order "+direction+" ? ORDER BY sort_order "+order+",created_at "+order+" LIMIT 1 FOR UPDATE",[current[0].screen_id,ctx.tenant,current[0].sort_order]);
     if(neighbor.length){await conn.execute("UPDATE display_slides SET sort_order=? WHERE id=? AND tenant_id=?",[current[0].sort_order,neighbor[0].id,ctx.tenant]);await conn.execute("UPDATE display_slides SET sort_order=? WHERE id=? AND tenant_id=?",[neighbor[0].sort_order,current[0].id,ctx.tenant]);}
     await conn.commit();return reply({ok:true});
    }catch{await conn.rollback();return reply({ok:false,code:"SLIDE_REORDER_FAILED"},503);}finally{conn.release();}
   }
   if(body.enabled!==undefined){await database().execute("UPDATE display_slides SET enabled=? WHERE id=? AND tenant_id=?",[Boolean(body.enabled),body.id,ctx.tenant]);return reply({ok:true});}
   await database().execute("DELETE FROM display_slides WHERE id=? AND tenant_id=?",[body.id,ctx.tenant]);return reply({ok:true});
  }
  return reply({ok:false,code:"INVALID_KIND"},400);
 }catch{return reply({ok:false,code:"DISPLAY_UPDATE_FAILED"},503);}
}
export async function DELETE(req:Request){
 try{assertSameOrigin(req);}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 let ctx;try{ctx=await context(req,true);}catch(e){return fail(e);}
 let body:Record<string,unknown>;try{body=await readLimitedJson(req,1024) as Record<string,unknown>;}catch{return reply({ok:false,code:"INVALID_INPUT"},400);}
 if(typeof body?.id!=="string")return reply({ok:false,code:"INVALID_INPUT"},400);
 try{await database().execute("DELETE FROM display_screens WHERE id=? AND tenant_id=?",[body.id,ctx.tenant]);return reply({ok:true});}catch{return reply({ok:false,code:"DISPLAY_DELETE_FAILED"},503);}
}
