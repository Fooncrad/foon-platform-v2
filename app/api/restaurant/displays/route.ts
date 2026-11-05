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
  const [screens]=await database().execute<RowDataPacket[]>("SELECT id,name,branch_id,refresh_seconds,enabled,paused,qr_enabled,created_at FROM display_screens WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100",[ctx.tenant]);
  const ids=screens.map(x=>String(x.id));let slides:RowDataPacket[]=[];
  if(ids.length){const marks=ids.map(()=>"?").join(",");const [rows]=await database().execute<RowDataPacket[]>("SELECT id,screen_id,media_url,title_ar,title_en,title_fr,subtitle_ar,subtitle_en,subtitle_fr,duration_seconds,sort_order,starts_at,ends_at,enabled FROM display_slides WHERE tenant_id=? AND screen_id IN ("+marks+") ORDER BY sort_order,created_at",[ctx.tenant,...ids]);slides=rows;}
  return reply({ok:true,screens:screens.map(s=>({...s,slides:slides.filter(x=>x.screen_id===s.id)}))});
 }catch{return reply({ok:false,code:"DISPLAY_LIST_FAILED"},503);}
}
export async function POST(req:Request){
 try{assertSameOrigin(req);}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 let ctx;try{ctx=await context(req,true);}catch(e){return fail(e);}
 let body:Record<string,unknown>;try{body=await readLimitedJson(req,8192) as Record<string,unknown>;}catch{return reply({ok:false,code:"INVALID_INPUT"},400);}
 const action=body?.action;
 try{
  if(action==="screen"){
   if(typeof body.name!=="string"||!body.name.trim()||body.name.length>120)return reply({ok:false,code:"INVALID_NAME"},400);
   const branch=typeof body.branchId==="string"&&body.branchId?body.branchId:null;
   if(branch){const [b]=await database().execute<RowDataPacket[]>("SELECT id FROM branches WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[branch,ctx.tenant]);if(!b.length)return reply({ok:false,code:"BRANCH_NOT_FOUND"},404);}
   const id=randomUUID(),token=randomBytes(32).toString("base64url");
   await database().execute("INSERT INTO display_screens(id,tenant_id,branch_id,name,token_hash,created_by) VALUES (?,?,?,?,?,?)",[id,ctx.tenant,branch,body.name.trim(),digest(token),ctx.user]);
   return reply({ok:true,id,token},201);
  }
  if(action==="slide"){
   if(typeof body.screenId!=="string"||typeof body.mediaUrl!=="string"||!/^\/api\/restaurant\/assets\/[a-f0-9-]{36}$/i.test(body.mediaUrl))return reply({ok:false,code:"INVALID_MEDIA"},400);
   const [screens]=await database().execute<RowDataPacket[]>("SELECT id FROM display_screens WHERE id=? AND tenant_id=? LIMIT 1",[body.screenId,ctx.tenant]);if(!screens.length)return reply({ok:false,code:"SCREEN_NOT_FOUND"},404);
   const [assets]=await database().execute<RowDataPacket[]>("SELECT id FROM restaurant_assets WHERE id=? AND tenant_id=? LIMIT 1",[body.mediaUrl.slice("/api/restaurant/assets/".length),ctx.tenant]);if(!assets.length)return reply({ok:false,code:"MEDIA_NOT_FOUND"},404);
   const duration=Math.max(5,Math.min(120,Number(body.durationSeconds)||10));
   const id=randomUUID();
   await database().execute("INSERT INTO display_slides(id,screen_id,tenant_id,media_url,title_ar,title_en,title_fr,subtitle_ar,subtitle_en,subtitle_fr,duration_seconds,sort_order,starts_at,ends_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,body.screenId,ctx.tenant,body.mediaUrl,...(["titleAr","titleEn","titleFr","subtitleAr","subtitleEn","subtitleFr"].map(k=>typeof body[k]==="string"?String(body[k]).slice(0,k.startsWith("title")?180:500):null)),duration,Math.max(0,Number(body.sortOrder)||0),body.startsAt||null,body.endsAt||null]);
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
   if(body.refreshSeconds!==undefined)allowed.refresh_seconds=Math.max(5,Math.min(120,Number(body.refreshSeconds)||15));
   const entries=Object.entries(allowed);if(!entries.length)return reply({ok:false,code:"NO_CHANGES"},400);
   await database().execute("UPDATE display_screens SET "+entries.map(([k])=>k+"=?").join(",")+" WHERE id=? AND tenant_id=?",[...entries.map(([,v])=>v),body.id,ctx.tenant]);
   return reply({ok:true});
  }
  if(body.kind==="slide"){
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
