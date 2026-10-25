import {queueCommissionNotice} from "@/lib/creator/commission-notices";
import {dispatchNotifications} from "@/lib/notifications/dispatch";
import {NextResponse} from "next/server";
import {database} from "@/lib/db/mysql";
import {randomUUID} from "node:crypto";
import type {RowDataPacket,ResultSetHeader} from "mysql2/promise";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
import {percentToBasisPoints} from "@/lib/creator/subscription-commission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers});
// These actions only accept a percentage toggle or a commission id/status/reference.
// Bound the actual stream, not just Content-Length, before JSON parsing.
const MAX_COMMISSION_ACTION_BYTES=1024;
async function actionBody(request:Request):Promise<{value:Record<string,unknown>|null;error:Response|null}>{
 try{
  const parsed=await readLimitedJson(request,MAX_COMMISSION_ACTION_BYTES);
  return {value:parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as Record<string,unknown>:null,error:null};
 }catch(error){
  const tooLarge=error instanceof Error&&error.message==="BATCH_TOO_LARGE";
  return {value:null,error:reply({ok:false,code:tooLarge?"BODY_TOO_LARGE":"INVALID_INPUT"},tooLarge?413:400)};
 }
}
async function actor(write:boolean){
 const id=await currentActiveAdminUserId();if(!id)return null;
 try{await requirePlatformRole(id,write?["super_admin"]:["super_admin","admin","support"]);return id;}catch{return null;}
}
export async function GET(){
 const id=await actor(false);if(!id)return reply({ok:false,code:"FORBIDDEN"},403);
 try{
  const [[settings],[commissions]]=await Promise.all([
   database().execute<RowDataPacket[]>("SELECT enabled,commission_basis_points,updated_at FROM platform_creator_referral_settings WHERE id=1"),
   database().execute<RowDataPacket[]>("SELECT c.id,c.payment_request_id,c.tenant_id,t.name AS tenant_name,c.creator_user_id,p.display_name AS creator_name,c.billing_cycle,c.currency,CAST(c.base_amount AS CHAR) AS base_amount,c.commission_basis_points,CAST(c.amount AS CHAR) AS amount,c.status,c.created_at,c.paid_at,c.payout_reference FROM customer_creator_commissions c JOIN tenants t ON t.id=c.tenant_id JOIN customer_creator_profiles p ON p.user_id=c.creator_user_id ORDER BY c.created_at DESC,c.id DESC LIMIT 200")
  ]);
  return reply({ok:true,settings:settings[0]??null,commissions});
 }catch{return reply({ok:false,code:"COMMISSION_REPORT_UNAVAILABLE"},503);}
}
export async function PUT(request:Request){
 try{assertSameOrigin(request);}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 const id=await actor(true);if(!id)return reply({ok:false,code:"FORBIDDEN"},403);
 const {value:data,error:bodyError}=await actionBody(request);
 if(bodyError)return bodyError;
 const rate=percentToBasisPoints(data?.percentage),enabled=data?.enabled;
 if(typeof enabled!=="boolean"||rate===null)return reply({ok:false,code:"INVALID_RATE"},400);
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [before]=await db.execute<RowDataPacket[]>("SELECT enabled,commission_basis_points FROM platform_creator_referral_settings WHERE id=1 FOR UPDATE");
  await db.execute("UPDATE platform_creator_referral_settings SET enabled=?,commission_basis_points=?,updated_by=? WHERE id=1",
   [enabled,rate,id]);
  await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id,metadata_json) VALUES (?,?,?,?,?)",
   [id,"creator.referral.settings.update","creator_referral_settings","1",JSON.stringify({before:before[0]??null,enabled,percentage:data?.percentage})]);
  await db.commit();return reply({ok:true,enabled,commission_basis_points:rate});
 }catch{await db.rollback();return reply({ok:false,code:"COMMISSION_SETTINGS_FAILED"},503);}finally{db.release();}
}
export async function PATCH(request:Request){
 try{assertSameOrigin(request);}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 const id=await actor(true);if(!id)return reply({ok:false,code:"FORBIDDEN"},403);
 const {value:body,error:bodyError}=await actionBody(request);
 if(bodyError)return bodyError;
 if(!body||typeof body.id!=="string"||!/^[0-9a-f-]{36}$/i.test(body.id)||typeof body.status!=="string"||!["paid","reversed"].includes(body.status)||typeof body.reference!=="string"||body.reference.trim().length<8||body.reference.trim().length>160)return reply({ok:false,code:"INVALID_INPUT"},400);
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [rows]=await db.execute<RowDataPacket[]>("SELECT c.id,c.status,c.amount,c.currency FROM customer_creator_commissions c JOIN users u ON u.id=c.creator_user_id AND u.status='active' WHERE c.id=? AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=c.creator_user_id) AND NOT EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id=c.creator_user_id) FOR UPDATE",[body.id]);
  if(!rows.length||rows[0].status!=="earned"){await db.rollback();return reply({ok:false,code:"COMMISSION_NOT_PAYABLE"},409);}
  const [update]=await db.execute<ResultSetHeader>(
   "UPDATE customer_creator_commissions SET status=?,payout_reference=?,paid_at=CASE WHEN ?='paid' THEN NOW() ELSE NULL END,reviewed_by=?,reviewed_at=NOW() WHERE id=? AND status='earned'",
   [body.status,body.reference.trim(),body.status,id,body.id]);
  if(update.affectedRows!==1)throw Error("COMMISSION_CONFLICT");
  await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id,metadata_json) VALUES (?,?,?,?,?)",
   [id,"creator.commission."+body.status,"creator_commission",body.id,JSON.stringify({reference:body.reference.trim(),amount:String(rows[0].amount),currency:rows[0].currency})]);
  await queueCommissionNotice(db,body.id,body.status);
  await db.commit();dispatchNotifications();return reply({ok:true});
 }catch{await db.rollback();return reply({ok:false,code:"COMMISSION_REVIEW_FAILED"},503);}finally{db.release();}
}
