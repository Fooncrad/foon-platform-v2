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
import {publishDisplayInvalidation} from "@/lib/display/realtime";
import {parseData,saveResource} from "@/lib/restaurant/operations";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
const digest=(token:string)=>createHash("sha256").update(token).digest("hex");
async function context(req:Request,write=false){
 const user=await currentUserId();if(!user)throw Object.assign(new Error("UNAUTHENTICATED"),{status:401});
 const tenant=req.headers.get("x-foon-tenant")??"";if(!tenant)throw Object.assign(new Error("TENANT_REQUIRED"),{status:400});
 let member;try{member=await requireTenantMembership(user,tenant,["owner","manager"],write);}catch{throw Object.assign(new Error("FORBIDDEN"),{status:403});}
 if(!(await tenantEntitlement(tenant,"display_advertising")).enabled)throw Object.assign(new Error("PLAN_FEATURE_REQUIRED"),{status:403});
 if(write)await requireAllAdditionalBranchesUnlocked(member.tenantId,user);
 return {user,tenant:member.tenantId,role:member.role};
}
function fail(e:unknown){const status=Number((e as {status?:number})?.status)||503;return reply({ok:false,code:e instanceof Error?e.message:"DISPLAY_UNAVAILABLE"},status);}
export async function GET(req:Request){
 let ctx;try{ctx=await context(req);}catch(e){return fail(e);}
 try{
  const [screens]=await database().execute<RowDataPacket[]>("SELECT id,name,branch_id,refresh_seconds,enabled,paused,qr_enabled,qr_position,qr_size,qr_foreground,qr_background,display_layout,kiosk_pin_hash,last_seen_at,player_health_json,player_health_at,player_error_code,CASE WHEN last_seen_at>=UTC_TIMESTAMP()-INTERVAL 60 SECOND THEN TRUE ELSE FALSE END AS is_online,created_at FROM display_screens WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100",[ctx.tenant]);
  const ids=screens.map(x=>String(x.id));let slides:RowDataPacket[]=[];
  if(ids.length){const marks=ids.map(()=>"?").join(",");const [rows]=await database().execute<RowDataPacket[]>("SELECT s.id,s.screen_id,s.campaign_id,s.source_type,s.source_id,COALESCE(s.media_url,CASE WHEN s.source_type='restaurant_menu_item' THEN mi.image_url WHEN s.source_type='catalog_product' THEN (SELECT ci.image_url FROM catalog_images ci WHERE ci.tenant_id=s.tenant_id AND ci.product_id=s.source_id ORDER BY ci.sort_order,ci.id LIMIT 1) WHEN s.source_type='restaurant_menu_category' THEN (SELECT ri.image_url FROM restaurant_menu_items ri WHERE ri.tenant_id=s.tenant_id AND ri.category_id=s.source_id AND ri.enabled=TRUE AND ri.image_url IS NOT NULL ORDER BY ri.sort_order,ri.name LIMIT 1) WHEN s.source_type='catalog_category' THEN cc.image_url END) AS media_url,s.audio_url,s.external_video_url,s.video_loop,s.transition_effect,COALESCE(s.badge_text,CASE WHEN s.source_type='restaurant_menu_item' THEN CONCAT(FORMAT(mi.price,2),' ',mi.currency) WHEN s.source_type='catalog_product' THEN CONCAT(FORMAT(cp.price,2),' ',cp.currency) END) AS badge_text,s.campaign_match_key,COALESCE(s.title_ar,mi.name,cp.name_ar,mc.name,cc.name_ar) AS title_ar,COALESCE(s.title_en,JSON_UNQUOTE(JSON_EXTRACT(mr.data,'$.nameEn')),cp.name_en,cc.name_en) AS title_en,COALESCE(s.title_fr,JSON_UNQUOTE(JSON_EXTRACT(mr.data,'$.nameFr')),cp.name_fr,cc.name_fr) AS title_fr,COALESCE(s.subtitle_ar,mi.description,cp.description_ar,cc.description_ar) AS subtitle_ar,COALESCE(s.subtitle_en,cp.description_en) AS subtitle_en,COALESCE(s.subtitle_fr,cp.description_fr) AS subtitle_fr,s.duration_seconds,s.sort_order,s.starts_at,s.ends_at,s.enabled FROM display_slides s LEFT JOIN restaurant_menu_items mi ON s.source_type='restaurant_menu_item' AND mi.id=s.source_id AND mi.tenant_id=s.tenant_id AND mi.enabled=TRUE LEFT JOIN restaurant_resources mr ON mr.id=mi.id AND mr.tenant_id=mi.tenant_id AND mr.kind='menu_item' LEFT JOIN catalog_products cp ON s.source_type='catalog_product' AND cp.id=s.source_id AND cp.tenant_id=s.tenant_id AND cp.enabled=TRUE AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(cp.attributes,'$.__foon_archived')),'0') NOT IN ('1','true') LEFT JOIN restaurant_menu_categories mc ON s.source_type='restaurant_menu_category' AND mc.id=s.source_id AND mc.tenant_id=s.tenant_id AND mc.enabled=TRUE LEFT JOIN catalog_categories cc ON s.source_type='catalog_category' AND cc.id=s.source_id AND cc.tenant_id=s.tenant_id AND cc.enabled=TRUE WHERE s.tenant_id=? AND s.screen_id IN ("+marks+") ORDER BY s.sort_order,s.created_at",[ctx.tenant,...ids]);slides=rows;}
  const [campaigns]=await database().execute<RowDataPacket[]>("SELECT id,CASE WHEN status='paused' THEN 'paused' WHEN ends_at IS NOT NULL AND ends_at<=UTC_TIMESTAMP() THEN 'completed' WHEN starts_at IS NOT NULL AND starts_at>UTC_TIMESTAMP() THEN 'scheduled' ELSE 'active' END AS status,destinations,branch_ids,creative,starts_at,ends_at,previous_cover_url,applied_cover_url,created_at FROM display_campaigns WHERE tenant_id=? ORDER BY created_at DESC LIMIT 50",[ctx.tenant]);
  const decodeJson=(value:unknown)=>{if(typeof value!=="string")return value;try{return JSON.parse(value);}catch{return null;}};
  return reply({ok:true,campaigns:campaigns.map(c=>({...c,destinations:decodeJson(c.destinations),branch_ids:decodeJson(c.branch_ids),creative:decodeJson(c.creative)})),screens:screens.map(s=>({...s,kiosk_protected:Boolean(s.kiosk_pin_hash),kiosk_pin_hash:undefined,slides:slides.filter(x=>x.screen_id===s.id)}))});
 }catch{return reply({ok:false,code:"DISPLAY_LIST_FAILED"},503);}
}
export async function POST(req:Request){
 try{assertSameOrigin(req);}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 let ctx;try{ctx=await context(req,true);}catch(e){return fail(e);}
 let body:Record<string,unknown>;try{body=await readLimitedJson(req,8192) as Record<string,unknown>;}catch{return reply({ok:false,code:"INVALID_INPUT"},400);}
 const action=body?.action;
 try{
  if(action==="pairClaim"){
   const code=typeof body.code==="string"?body.code.trim():"";
   const name=typeof body.name==="string"?body.name.trim():"";
   const branchId=typeof body.branchId==="string"&&body.branchId?body.branchId:null;
   if(!/^\d{8}$/.test(code)||!name||name.length>120)return reply({ok:false,code:"INVALID_PAIRING_INPUT"},400);
   if(branchId&&!/^[a-f0-9-]{36}$/i.test(branchId))return reply({ok:false,code:"INVALID_BRANCH_SELECTION"},400);
   const conn=await database().getConnection();
   let screenId="";
   try{
    await conn.beginTransaction();
    const [sessions]=await conn.execute<RowDataPacket[]>("SELECT id,token_hash FROM display_pairing_sessions WHERE code_hash=? AND expires_at>UTC_TIMESTAMP() AND claimed_screen_id IS NULL LIMIT 1 FOR UPDATE",[digest(code)]);
    if(!sessions.length){await conn.rollback();return reply({ok:false,code:"PAIRING_CODE_INVALID_OR_EXPIRED"},404);}
    if(branchId){
     const [branches]=await conn.execute<RowDataPacket[]>("SELECT id FROM branches WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[branchId,ctx.tenant]);
     if(!branches.length){await conn.rollback();return reply({ok:false,code:"BRANCH_NOT_FOUND"},404);}
    }
    screenId=randomUUID();
    await conn.execute("INSERT INTO display_screens(id,tenant_id,branch_id,name,token_hash,created_by) VALUES (?,?,?,?,?,?)",[screenId,ctx.tenant,branchId,name,String(sessions[0].token_hash),ctx.user]);
    await conn.execute("UPDATE display_pairing_sessions SET claimed_screen_id=?,claimed_at=UTC_TIMESTAMP() WHERE id=? AND claimed_screen_id IS NULL",[screenId,sessions[0].id]);
    await conn.commit();
   }catch(error){await conn.rollback();throw error;}finally{conn.release();}
   await publishDisplayInvalidation(ctx.tenant,screenId);
   return reply({ok:true,id:screenId,name,branchId},201);
  }
  if(action==="campaign"){
   const includeDisplays=body.includeDisplays!==false;
   const includeMenuBanner=body.includeMenuBanner===true;
   if(!includeDisplays&&!includeMenuBanner)return reply({ok:false,code:"NO_CAMPAIGN_DESTINATIONS"},400);
   const requestedBranches=Array.isArray(body.branchIds)?body.branchIds.filter((x):x is string=>typeof x==="string"&&/^[a-f0-9-]{36}$/i.test(x)):null;
   if(includeDisplays&&body.branchIds!==undefined&&(!Array.isArray(body.branchIds)||!requestedBranches||requestedBranches.length===0||requestedBranches.length>50||requestedBranches.length!==body.branchIds.length))return reply({ok:false,code:"INVALID_BRANCH_SELECTION"},400);
   if(requestedBranches?.length){
    const [validBranches]=await database().execute<RowDataPacket[]>("SELECT id FROM branches WHERE tenant_id=? AND enabled=TRUE AND id IN ("+requestedBranches.map(()=>"?").join(",")+")",[ctx.tenant,...requestedBranches]);
    if(validBranches.length!==new Set(requestedBranches).size)return reply({ok:false,code:"BRANCH_NOT_FOUND"},404);
   }
   const sourceType=typeof body.sourceType==="string"?body.sourceType:"media";
   const sourceId=typeof body.sourceId==="string"&&/^[a-f0-9-]{36}$/i.test(body.sourceId)?body.sourceId:null;
   if(!["media","restaurant_menu_item","catalog_product","restaurant_menu_category","catalog_category"].includes(sourceType))return reply({ok:false,code:"INVALID_SOURCE"},400);
   const requestedMediaUrls=Array.isArray(body.mediaUrls)&&body.mediaUrls.length?body.mediaUrls:(sourceType==="media"&&typeof body.mediaUrl==="string"&&body.mediaUrl?[body.mediaUrl]:[]);
   if(requestedMediaUrls.length>20||requestedMediaUrls.some((url:unknown)=>typeof url!=="string"||!/^\/api\/restaurant\/assets\/[a-f0-9-]{36}$/i.test(url)))return reply({ok:false,code:"INVALID_MEDIA"},400);
   const mediaUrls=[...new Set(requestedMediaUrls as string[])];
   const mediaUrl=mediaUrls[0]??null;
   if(body.mediaUrl!=null&&body.mediaUrl!==""&&(!mediaUrl||body.mediaUrl!==mediaUrl))return reply({ok:false,code:"INVALID_MEDIA"},400);
   const videoUrl=sourceType==="media"&&typeof body.videoUrl==="string"&&body.videoUrl.trim()?body.videoUrl.trim():null;
   const audioUrl=typeof body.audioUrl==="string"&&body.audioUrl.trim()?body.audioUrl.trim():null;
   if(audioUrl&&!/^\/api\/restaurant\/assets\/[a-f0-9-]{36}$/i.test(audioUrl))return reply({ok:false,code:"INVALID_AUDIO"},400);
   if(sourceType==="media"?(mediaUrls.length===0&&!videoUrl):( !sourceId||Boolean(videoUrl)||mediaUrls.length>0))return reply({ok:false,code:"INVALID_MEDIA"},400);
   if(videoUrl){try{const parsed=new URL(videoUrl);const host=parsed.hostname.toLowerCase();const privateHost=host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||host.includes(":")||/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);if(parsed.protocol!=="https:"||parsed.username||parsed.password||privateHost||! /\.(mp4|webm)$/i.test(parsed.pathname))return reply({ok:false,code:"INVALID_VIDEO_URL"},400);}catch{return reply({ok:false,code:"INVALID_VIDEO_URL"},400);}}
   if(mediaUrls.length){const assetIds=mediaUrls.map(url=>url.slice("/api/restaurant/assets/".length));const [assets]=await database().execute<RowDataPacket[]>("SELECT id FROM restaurant_assets WHERE tenant_id=? AND mime_type LIKE 'image/%' AND id IN ("+assetIds.map(()=>"?").join(",")+")", [ctx.tenant,...assetIds]);if(assets.length!==assetIds.length)return reply({ok:false,code:"MEDIA_NOT_FOUND"},404);}
   if(audioUrl){const [audioAssets]=await database().execute<RowDataPacket[]>("SELECT id FROM restaurant_assets WHERE tenant_id=? AND mime_type IN ('audio/mpeg','audio/wav','audio/x-wav','audio/aac','audio/mp4','audio/ogg','audio/webm') AND id=? LIMIT 1",[ctx.tenant,audioUrl.slice("/api/restaurant/assets/".length)]);if(!audioAssets.length)return reply({ok:false,code:"AUDIO_NOT_FOUND_OR_INVALID_TYPE"},404);}
   const sourceTables:Record<string,[string,string]>={restaurant_menu_item:["restaurant_menu_items","enabled=TRUE"],catalog_product:["catalog_products","enabled=TRUE AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(attributes,'$.__foon_archived')),'0') NOT IN ('1','true')"],restaurant_menu_category:["restaurant_menu_categories","enabled=TRUE"],catalog_category:["catalog_categories","enabled=TRUE"]};
   if(sourceType!=="media"){const [table,condition]=sourceTables[sourceType];const [rows]=await database().execute<RowDataPacket[]>("SELECT id FROM "+table+" WHERE id=? AND tenant_id=? AND "+condition+" LIMIT 1",[sourceId,ctx.tenant]);if(!rows.length)return reply({ok:false,code:"SOURCE_NOT_FOUND"},404);}
   const duration=Math.max(5,Math.min(120,Number(body.durationSeconds)||10));
   const startsAt=body.startsAt==null||body.startsAt===""?null:typeof body.startsAt==="string"?body.startsAt:null;
   const endsAt=body.endsAt==null||body.endsAt===""?null:typeof body.endsAt==="string"?body.endsAt:null;
   const validDate=(value:string|null)=>value===null||(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)&&Number.isFinite(Date.parse(value.replace(" ","T")+"Z")));
   if(!validDate(startsAt)||!validDate(endsAt)||(startsAt&&endsAt&&Date.parse(endsAt.replace(" ","T")+"Z")<=Date.parse(startsAt.replace(" ","T")+"Z")))return reply({ok:false,code:"INVALID_SCHEDULE"},400);
   const [targetScreens]=includeDisplays?await database().execute<RowDataPacket[]>("SELECT id,branch_id FROM display_screens WHERE tenant_id=? AND enabled=TRUE AND paused=FALSE AND (branch_id IS NULL OR EXISTS (SELECT 1 FROM branches b WHERE b.id=display_screens.branch_id AND b.tenant_id=display_screens.tenant_id AND b.enabled=TRUE))"+(requestedBranches?.length?" AND branch_id IN ("+requestedBranches.map(()=>"?").join(",")+")":"")+" ORDER BY created_at LIMIT 101",[ctx.tenant,...(requestedBranches??[])]):[[] as RowDataPacket[]];
   if(includeDisplays&&!targetScreens.length){const [stateRows]=await database().execute<RowDataPacket[]>("SELECT COUNT(*) AS total,SUM(enabled=TRUE AND paused=TRUE) AS paused,SUM(enabled=FALSE) AS disabled FROM display_screens WHERE tenant_id=?",[ctx.tenant]);const state=stateRows[0]??{};return reply({ok:false,code:"NO_ACTIVE_DISPLAYS",screenState:{total:Number(state.total??0),paused:Number(state.paused??0),disabled:Number(state.disabled??0)}},409);}
   if(targetScreens.length>100)return reply({ok:false,code:"TOO_MANY_DISPLAYS",max:100},413);
   const campaignId=randomUUID();
   const conn=await database().getConnection();
   try{
    await conn.beginTransaction();
    const transition=["fade","zoom","slide","kenburns"].includes(String(body.transitionEffect))?String(body.transitionEffect):"fade";
    const badge=typeof body.badgeText==="string"?body.badgeText.trim().slice(0,64):null;
    const creative={sourceType,sourceId,mediaUrl,mediaUrls,videoUrl,audioUrl,videoLoop:body.videoLoop!==false,transitionEffect:transition,badgeText:badge,durationSeconds:duration,titleAr:body.titleAr??null,titleEn:body.titleEn??null,titleFr:body.titleFr??null,subtitleAr:body.subtitleAr??null,subtitleEn:body.subtitleEn??null,subtitleFr:body.subtitleFr??null};
    const destinations={screens:includeDisplays,menuBanner:includeMenuBanner,scope:includeDisplays?(requestedBranches?.length?"selected":"all"):"none"};
    const campaignStatus=endsAt&&Date.parse(endsAt.replace(" ","T")+"Z")<=Date.now()?"completed":startsAt&&Date.parse(startsAt.replace(" ","T")+"Z")>Date.now()?"scheduled":"active";
    await conn.execute("INSERT INTO display_campaigns(id,tenant_id,status,destinations,branch_ids,creative,starts_at,ends_at,created_by) VALUES (?,?,?,?,?,?,?,?,?)",[campaignId,ctx.tenant,campaignStatus,JSON.stringify(destinations),requestedBranches?.length?JSON.stringify(requestedBranches):null,JSON.stringify(creative),startsAt,endsAt,ctx.user]);
    for(const screen of targetScreens){
     const [lastOrder]=await conn.execute<RowDataPacket[]>("SELECT COALESCE(MAX(sort_order),-1)+1 AS next_order FROM display_slides WHERE screen_id=? AND tenant_id=?",[screen.id,ctx.tenant]);
     let sortOrder=Number(lastOrder[0]?.next_order??0);
     const slideMedia=mediaUrls.length?mediaUrls:(mediaUrl?[mediaUrl]:(sourceType!=="media"?[null]:[]));
     for(const slideMediaUrl of slideMedia){
      const id=randomUUID();
      await conn.execute("INSERT INTO display_slides(id,screen_id,tenant_id,campaign_id,media_url,audio_url,source_type,source_id,external_video_url,video_loop,transition_effect,badge_text,campaign_match_key,title_ar,title_en,title_fr,subtitle_ar,subtitle_en,subtitle_fr,duration_seconds,enabled,sort_order,starts_at,ends_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,TRUE,?,?,?)",[id,screen.id,ctx.tenant,campaignId,slideMediaUrl,audioUrl,mediaUrls.length?"media":sourceType,mediaUrls.length?null:sourceId,mediaUrls.length?null:videoUrl,body.videoLoop!==false,transition,badge,null,...(["titleAr","titleEn","titleFr","subtitleAr","subtitleEn","subtitleFr"].map(k=>typeof body[k]==="string"?String(body[k]).slice(0,k.startsWith("title")?180:500):null)),duration,sortOrder++,startsAt,endsAt]);
     }
     if(videoUrl){const id=randomUUID();await conn.execute("INSERT INTO display_slides(id,screen_id,tenant_id,campaign_id,media_url,audio_url,source_type,source_id,external_video_url,video_loop,transition_effect,badge_text,campaign_match_key,title_ar,title_en,title_fr,subtitle_ar,subtitle_en,subtitle_fr,duration_seconds,enabled,sort_order,starts_at,ends_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,TRUE,?,?,?)",[id,screen.id,ctx.tenant,campaignId,null,audioUrl,"media",null,videoUrl,body.videoLoop!==false,transition,badge,null,...(["titleAr","titleEn","titleFr","subtitleAr","subtitleEn","subtitleFr"].map(k=>typeof body[k]==="string"?String(body[k]).slice(0,k.startsWith("title")?180:500):null)),duration,sortOrder++,startsAt,endsAt]);}
    }
    if(includeMenuBanner){
     let coverUrl=mediaUrl;
     if(!coverUrl&&sourceType==="restaurant_menu_item"){const [rows]=await conn.execute<RowDataPacket[]>("SELECT image_url FROM restaurant_menu_items WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[sourceId,ctx.tenant]);coverUrl=typeof rows[0]?.image_url==="string"?String(rows[0].image_url):null;}
     if(!coverUrl&&sourceType==="catalog_product"){const [rows]=await conn.execute<RowDataPacket[]>("SELECT image_url FROM catalog_images WHERE product_id=? AND tenant_id=? ORDER BY sort_order,id LIMIT 1",[sourceId,ctx.tenant]);coverUrl=typeof rows[0]?.image_url==="string"?String(rows[0].image_url):null;}
     if(!coverUrl&&sourceType==="restaurant_menu_category"){const [rows]=await conn.execute<RowDataPacket[]>("SELECT image_url FROM restaurant_menu_categories WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[sourceId,ctx.tenant]);coverUrl=typeof rows[0]?.image_url==="string"?String(rows[0].image_url):null;}
     if(!coverUrl&&sourceType==="catalog_category"){const [rows]=await conn.execute<RowDataPacket[]>("SELECT image_url FROM catalog_categories WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[sourceId,ctx.tenant]);coverUrl=typeof rows[0]?.image_url==="string"?String(rows[0].image_url):null;}
     if(!coverUrl||!/^\/api\/restaurant\/assets\/[a-f0-9-]{36}$/i.test(coverUrl))throw Object.assign(new Error("BANNER_REQUIRES_FOON_IMAGE"),{status:400});
     const [existing]=await conn.execute<RowDataPacket[]>("SELECT id,name,status,data,version FROM restaurant_resources WHERE tenant_id=? AND kind='storefront_config' AND archived=FALSE AND status='active' LIMIT 1 FOR UPDATE",[ctx.tenant]);
     const previous=existing[0];
     const previousCover=previous?parseData(previous.data).coverUrl:null;
     await conn.execute("UPDATE display_campaigns SET previous_cover_url=?,applied_cover_url=? WHERE id=? AND tenant_id=?",[typeof previousCover==="string"?previousCover:null,coverUrl,campaignId,ctx.tenant]);
     await saveResource(conn,ctx.tenant,ctx.user,ctx.role,"storefront",previous?{id:String(previous.id),version:Number(previous.version),name:String(previous.name),status:String(previous.status),branchId:null,data:{...parseData(previous.data),coverUrl,displayCampaignId:campaignId}}:{name:"واجهة النشاط",status:"active",branchId:null,data:{coverUrl,displayCampaignId:campaignId}});
    }
    await conn.commit();
   }catch(error){await conn.rollback();throw error;}finally{conn.release();}
   await Promise.all(targetScreens.map(screen=>publishDisplayInvalidation(ctx.tenant,String(screen.id))));
   return reply({ok:true,campaignId,screenCount:targetScreens.length,menuBannerUpdated:includeMenuBanner,branchIds:[...new Set(targetScreens.map(s=>s.branch_id).filter(Boolean))]},201);
  }
  if(action==="kioskPin"){
   if(typeof body.screenId!=="string"||typeof body.pin!=="string"||body.pin.length>8)return reply({ok:false,code:"INVALID_INPUT"},400);
   const pin=body.pin.trim();
   if(pin!==""&&!/^\d{4,8}$/.test(pin))return reply({ok:false,code:"INVALID_KIOSK_PIN"},400);
   const record=pin?createKioskPinRecord(pin):null;
   const [result]=await database().execute("UPDATE display_screens SET kiosk_pin_salt=?,kiosk_pin_hash=?,kiosk_failed_attempts=0,kiosk_locked_until=NULL WHERE id=? AND tenant_id=?",[record?.salt??null,record?.hash??null,body.screenId,ctx.tenant]);
   if(Number((result as {affectedRows?:number}).affectedRows??0)!==1)return reply({ok:false,code:"SCREEN_NOT_FOUND"},404);
   await publishDisplayInvalidation(ctx.tenant,String(body.screenId));
   return reply({ok:true,enabled:Boolean(record)});
  }
  if(action==="rotate"){
   if(typeof body.screenId!=="string")return reply({ok:false,code:"INVALID_INPUT"},400);
   const token=randomBytes(32).toString("base64url");
   const [result]=await database().execute("UPDATE display_screens SET token_hash=? WHERE id=? AND tenant_id=?",[digest(token),body.screenId,ctx.tenant]);
   if(Number((result as {affectedRows?:number}).affectedRows??0)!==1)return reply({ok:false,code:"SCREEN_NOT_FOUND"},404);
   await publishDisplayInvalidation(ctx.tenant,String(body.screenId));
   return reply({ok:true,token});
  }
  if(action==="screen"){
   if(typeof body.name!=="string"||!body.name.trim()||body.name.length>120)return reply({ok:false,code:"INVALID_NAME"},400);
   const branch=typeof body.branchId==="string"&&body.branchId?body.branchId:null;
   if(branch){const [b]=await database().execute<RowDataPacket[]>("SELECT id FROM branches WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[branch,ctx.tenant]);if(!b.length)return reply({ok:false,code:"BRANCH_NOT_FOUND"},404);}
   const id=randomUUID(),token=randomBytes(32).toString("base64url");
   await database().execute("INSERT INTO display_screens(id,tenant_id,branch_id,name,token_hash,created_by) VALUES (?,?,?,?,?,?)",[id,ctx.tenant,branch,body.name.trim(),digest(token),ctx.user]);
   await publishDisplayInvalidation(ctx.tenant,id);
   return reply({ok:true,id,token},201);
  }
  if(action==="slide"){
   if(typeof body.screenId!=="string")return reply({ok:false,code:"INVALID_INPUT"},400);
   const sourceType=typeof body.sourceType==="string"?body.sourceType:"media";
   const sourceId=typeof body.sourceId==="string"&&/^[a-f0-9-]{36}$/i.test(body.sourceId)?body.sourceId:null;
   if(!["media","restaurant_menu_item","catalog_product","restaurant_menu_category","catalog_category"].includes(sourceType))return reply({ok:false,code:"INVALID_SOURCE"},400);
   const mediaUrl=sourceType==="media"&&typeof body.mediaUrl==="string"&&/^\/api\/restaurant\/assets\/[a-f0-9-]{36}$/i.test(body.mediaUrl)?body.mediaUrl:null;
   const videoUrl=sourceType==="media"&&typeof body.videoUrl==="string"&&body.videoUrl.trim()?body.videoUrl.trim():null;
   if(sourceType==="media"?(Boolean(mediaUrl)===Boolean(videoUrl)):(!sourceId||body.mediaUrl||body.videoUrl))return reply({ok:false,code:"INVALID_MEDIA"},400);
   if(videoUrl){try{const parsed=new URL(videoUrl);const host=parsed.hostname.toLowerCase();const privateHost=host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||host.includes(":")||/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);if(parsed.protocol!=="https:"||parsed.username||parsed.password||privateHost||! /\.(mp4|webm)$/i.test(parsed.pathname))return reply({ok:false,code:"INVALID_VIDEO_URL"},400);}catch{return reply({ok:false,code:"INVALID_VIDEO_URL"},400);}}
   const [screens]=await database().execute<RowDataPacket[]>("SELECT id FROM display_screens WHERE id=? AND tenant_id=? LIMIT 1",[body.screenId,ctx.tenant]);if(!screens.length)return reply({ok:false,code:"SCREEN_NOT_FOUND"},404);
   if(mediaUrl){const [assets]=await database().execute<RowDataPacket[]>("SELECT id FROM restaurant_assets WHERE id=? AND tenant_id=? LIMIT 1",[mediaUrl.slice("/api/restaurant/assets/".length),ctx.tenant]);if(!assets.length)return reply({ok:false,code:"MEDIA_NOT_FOUND"},404);}
   if(sourceType==="restaurant_menu_item"){const [items]=await database().execute<RowDataPacket[]>("SELECT id FROM restaurant_menu_items WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[sourceId,ctx.tenant]);if(!items.length)return reply({ok:false,code:"SOURCE_NOT_FOUND"},404);}
   if(sourceType==="catalog_product"){const [items]=await database().execute<RowDataPacket[]>("SELECT id FROM catalog_products WHERE id=? AND tenant_id=? AND enabled=TRUE AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(attributes,'$.__foon_archived')),'0') NOT IN ('1','true') LIMIT 1",[sourceId,ctx.tenant]);if(!items.length)return reply({ok:false,code:"SOURCE_NOT_FOUND"},404);}
   if(sourceType==="restaurant_menu_category"){const [items]=await database().execute<RowDataPacket[]>("SELECT id FROM restaurant_menu_categories WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[sourceId,ctx.tenant]);if(!items.length)return reply({ok:false,code:"SOURCE_NOT_FOUND"},404);}
   if(sourceType==="catalog_category"){const [items]=await database().execute<RowDataPacket[]>("SELECT id FROM catalog_categories WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[sourceId,ctx.tenant]);if(!items.length)return reply({ok:false,code:"SOURCE_NOT_FOUND"},404);}
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
   await database().query("INSERT INTO display_slides(id,screen_id,tenant_id,media_url,source_type,source_id,external_video_url,video_loop,transition_effect,badge_text,campaign_match_key,title_ar,title_en,title_fr,subtitle_ar,subtitle_en,subtitle_fr,duration_seconds,sort_order,starts_at,ends_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,body.screenId,ctx.tenant,mediaUrl,sourceType,sourceId,videoUrl,body.videoLoop!==false,transition,badge,campaignKey||null,...(["titleAr","titleEn","titleFr","subtitleAr","subtitleEn","subtitleFr"].map(k=>typeof body[k]==="string"?String(body[k]).slice(0,k.startsWith("title")?180:500):null)),duration,sortOrder,startsAt,endsAt]);
   await publishDisplayInvalidation(ctx.tenant,String(body.screenId));
   return reply({ok:true,id},201);
  }
  return reply({ok:false,code:"INVALID_ACTION"},400);
 }catch(error){const status=Number((error as {status?:number})?.status);return reply({ok:false,code:status&&error instanceof Error?error.message:"DISPLAY_SAVE_FAILED"},status||503);}
}
export async function PATCH(req:Request){
 try{assertSameOrigin(req);}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 let ctx;try{ctx=await context(req,true);}catch(e){return fail(e);}
 let body:Record<string,unknown>;try{body=await readLimitedJson(req,4096) as Record<string,unknown>;}catch{return reply({ok:false,code:"INVALID_INPUT"},400);}
 if(typeof body?.id!=="string")return reply({ok:false,code:"INVALID_INPUT"},400);
 try{
  if(body.kind==="campaign"){
   if(!["pause","resume","delete"].includes(String(body.action)))return reply({ok:false,code:"INVALID_CAMPAIGN_ACTION"},400);
   const conn=await database().getConnection();
   let screenIds:string[]=[];
   try{
    await conn.beginTransaction();
    const [campaignRows]=await conn.execute<RowDataPacket[]>("SELECT * FROM display_campaigns WHERE id=? AND tenant_id=? LIMIT 1 FOR UPDATE",[body.id,ctx.tenant]);
    if(!campaignRows.length){await conn.rollback();return reply({ok:false,code:"CAMPAIGN_NOT_FOUND"},404);}
    const campaign=campaignRows[0];
    const [screenRows]=await conn.execute<RowDataPacket[]>("SELECT DISTINCT screen_id FROM display_slides WHERE campaign_id=? AND tenant_id=?",[body.id,ctx.tenant]);
    screenIds=screenRows.map(row=>String(row.screen_id));
    const [storefrontRows]=await conn.execute<RowDataPacket[]>("SELECT id,name,status,data,version FROM restaurant_resources WHERE tenant_id=? AND kind='storefront_config' AND archived=FALSE AND status='active' LIMIT 1 FOR UPDATE",[ctx.tenant]);
    const storefront=storefrontRows[0];
    const storefrontData=storefront?parseData(storefront.data):null;
    const appliedCover=typeof campaign.applied_cover_url==="string"?String(campaign.applied_cover_url):null;
    const previousCover=typeof campaign.previous_cover_url==="string"?String(campaign.previous_cover_url):null;
    const ownsCurrentCover=Boolean(storefrontData&&storefrontData.displayCampaignId===String(body.id)&&storefrontData.coverUrl===appliedCover);
    const saveCover=async(nextData:Record<string,string|number|null>)=>{
     if(!storefront)return;
     await saveResource(conn,ctx.tenant,ctx.user,ctx.role,"storefront",{id:String(storefront.id),version:Number(storefront.version),name:String(storefront.name),status:String(storefront.status),branchId:null,data:nextData});
    };
    if(body.action==="pause"){
     await conn.execute("UPDATE display_slides SET enabled=FALSE WHERE campaign_id=? AND tenant_id=?",[body.id,ctx.tenant]);
     if(ownsCurrentCover&&storefrontData){
      const nextData={...storefrontData};
      if(previousCover)nextData.coverUrl=previousCover;else delete nextData.coverUrl;
      delete nextData.displayCampaignId;
      await saveCover(nextData);
     }
     await conn.execute("UPDATE display_campaigns SET status='paused' WHERE id=? AND tenant_id=?",[body.id,ctx.tenant]);
    }else if(body.action==="resume"){
     await conn.execute("UPDATE display_slides SET enabled=TRUE WHERE campaign_id=? AND tenant_id=?",[body.id,ctx.tenant]);
     const starts=campaign.starts_at?new Date(campaign.starts_at).getTime():0;
     const ends=campaign.ends_at?new Date(campaign.ends_at).getTime():0;
     const nextStatus=ends&&ends<=Date.now()?"completed":starts&&starts>Date.now()?"scheduled":"active";
     await conn.execute("UPDATE display_campaigns SET status=? WHERE id=? AND tenant_id=?",[nextStatus,body.id,ctx.tenant]);
     const canReapplyCover=appliedCover&&storefrontData&&(storefrontData.displayCampaignId===String(body.id)||storefrontData.coverUrl===previousCover||(!storefrontData.coverUrl&&!previousCover));
     if(canReapplyCover){
      await saveCover({...storefrontData,coverUrl:appliedCover,displayCampaignId:String(body.id)});
     }
    }else{
     if(ownsCurrentCover&&storefrontData){
      const nextData={...storefrontData};
      if(previousCover)nextData.coverUrl=previousCover;else delete nextData.coverUrl;
      delete nextData.displayCampaignId;
      await saveCover(nextData);
     }
     await conn.execute("DELETE FROM display_campaigns WHERE id=? AND tenant_id=?",[body.id,ctx.tenant]);
    }
    await conn.commit();
   }catch{await conn.rollback();return reply({ok:false,code:"CAMPAIGN_UPDATE_FAILED"},503);}finally{conn.release();}
   await Promise.all(screenIds.map(screenId=>publishDisplayInvalidation(ctx.tenant,screenId)));
   return reply({ok:true,action:body.action,updatedScreens:screenIds.length});
  }
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
   await publishDisplayInvalidation(ctx.tenant,String(body.id));
   return reply({ok:true});
  }
  if(body.kind==="slide"){
   if(body.move==="up"||body.move==="down"){
    const conn=await database().getConnection();
    try{await conn.beginTransaction();
     const [current]=await conn.execute<RowDataPacket[]>("SELECT id,screen_id,sort_order,campaign_id FROM display_slides WHERE id=? AND tenant_id=? FOR UPDATE",[body.id,ctx.tenant]);
     if(!current.length){await conn.rollback();return reply({ok:false,code:"SLIDE_NOT_FOUND"},404);}
     const direction=body.move==="up"?"<":">",order=body.move==="up"?"DESC":"ASC";
     const campaignId=typeof current[0].campaign_id==="string"?String(current[0].campaign_id):"";
     const [movingRows]=campaignId
      ?await conn.execute<RowDataPacket[]>("SELECT id,screen_id,sort_order FROM display_slides WHERE campaign_id=? AND tenant_id=? FOR UPDATE",[campaignId,ctx.tenant])
      :[[current[0]] as RowDataPacket[]];
     const changedScreens=new Set<string>();
     for(const moving of movingRows){
      const [neighbor]=await conn.query<RowDataPacket[]>("SELECT id,sort_order FROM display_slides WHERE screen_id=? AND tenant_id=? AND "+(campaignId?"campaign_id<>? AND ":"")+"sort_order "+direction+" ? ORDER BY sort_order "+order+",created_at "+order+" LIMIT 1 FOR UPDATE",campaignId?[moving.screen_id,ctx.tenant,campaignId,moving.sort_order]:[moving.screen_id,ctx.tenant,moving.sort_order]);
      if(neighbor.length){
       await conn.execute("UPDATE display_slides SET sort_order=? WHERE id=? AND tenant_id=?",[moving.sort_order,neighbor[0].id,ctx.tenant]);
       await conn.execute("UPDATE display_slides SET sort_order=? WHERE id=? AND tenant_id=?",[neighbor[0].sort_order,moving.id,ctx.tenant]);
       changedScreens.add(String(moving.screen_id));
      }
     }
     await conn.commit();await Promise.all([...changedScreens].map(screenId=>publishDisplayInvalidation(ctx.tenant,screenId)));return reply({ok:true,updatedScreens:changedScreens.size});
    }catch{await conn.rollback();return reply({ok:false,code:"SLIDE_REORDER_FAILED"},503);}finally{conn.release();}
   }
   const [targets]=await database().execute<RowDataPacket[]>("SELECT id,screen_id,campaign_id FROM display_slides WHERE id=? AND tenant_id=? LIMIT 1",[body.id,ctx.tenant]);
   if(!targets.length)return reply({ok:false,code:"SLIDE_NOT_FOUND"},404);
   const campaignId=typeof targets[0].campaign_id==="string"?targets[0].campaign_id:"";
   const screenIds=campaignId?(await database().execute<RowDataPacket[]>("SELECT DISTINCT screen_id FROM display_slides WHERE campaign_id=? AND tenant_id=?",[campaignId,ctx.tenant]))[0]:[{screen_id:targets[0].screen_id}];
   if(body.enabled!==undefined){
    if(campaignId)await database().execute("UPDATE display_slides SET enabled=? WHERE campaign_id=? AND tenant_id=?",[Boolean(body.enabled),campaignId,ctx.tenant]);
    else await database().execute("UPDATE display_slides SET enabled=? WHERE id=? AND tenant_id=?",[Boolean(body.enabled),body.id,ctx.tenant]);
    await Promise.all(screenIds.map(screen=>publishDisplayInvalidation(ctx.tenant,String(screen.screen_id))));
    return reply({ok:true,updatedScreens:screenIds.length});
   }
   if(campaignId)await database().execute("DELETE FROM display_slides WHERE campaign_id=? AND tenant_id=?",[campaignId,ctx.tenant]);
   else await database().execute("DELETE FROM display_slides WHERE id=? AND tenant_id=?",[body.id,ctx.tenant]);
   await Promise.all(screenIds.map(screen=>publishDisplayInvalidation(ctx.tenant,String(screen.screen_id))));
   return reply({ok:true,deletedScreens:screenIds.length});
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
