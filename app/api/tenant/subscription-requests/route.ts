import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const reply=(value:object,status=200)=>NextResponse.json(value,{status,headers});
const uuid=(x:unknown):x is string=>typeof x==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
async function merchant(id:unknown){
 const user=await currentUserId();if(!user)return {status:401};
 if(!uuid(id))return {status:400};
 try{
  const role=await requireTenantMembership(user,id,["owner"],false);
  return role.adminAccess?{status:403}:{status:200,tenantId:id};
 }catch{return {status:403};}
}
export async function GET(request:Request){
 const id=new URL(request.url).searchParams.get("tenantId");
 const auth=await merchant(id);if(auth.status!==200)return reply({ok:false,code:"FORBIDDEN"},auth.status);
 try{
  const [[prices],[requests],[receipts]]=await Promise.all([
   database().execute<RowDataPacket[]>(
    "SELECT pp.id AS plan_id,pp.name_ar,pp.name_en,pp.name_fr,pr.billing_cycle,pr.currency,pr.price "+
    "FROM tenant_business_profiles t JOIN package_plan_prices pr ON pr.currency=t.currency AND pr.enabled=TRUE "+
    "JOIN package_plans pp ON pp.id=pr.plan_id AND pp.enabled=TRUE AND pp.code<>'free' "+
    "WHERE t.tenant_id=? AND pr.price>0 ORDER BY pp.sort_order,pr.billing_cycle",[id]),
   database().execute<RowDataPacket[]>("SELECT id,plan_id,amount,currency,billing_cycle,status,transfer_reference,review_note,created_at FROM platform_payment_requests WHERE tenant_id=? ORDER BY created_at DESC LIMIT 30",[id]),
   database().execute<RowDataPacket[]>("SELECT r.payment_request_id,r.receipt_number,r.amount,r.currency,r.issued_at,p.billing_cycle,pl.name_ar,pl.name_en,pl.name_fr FROM platform_payment_receipts r JOIN platform_payment_requests p ON p.id=r.payment_request_id AND p.tenant_id=r.tenant_id AND p.status='approved' JOIN package_plans pl ON pl.id=p.plan_id WHERE r.tenant_id=? ORDER BY r.issued_at DESC LIMIT 50",[id])
  ]);
  return reply({ok:true,prices,requests,receipts});
 }catch{return reply({ok:false,code:"SUBSCRIPTION_REQUESTS_UNAVAILABLE"},503);}
}
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 let data:unknown;
 try{data=await readLimitedJson(request,2048);}
 catch(error){
  const tooLarge=error instanceof Error&&error.message==="BATCH_TOO_LARGE";
  return reply({ok:false,code:tooLarge?"BODY_TOO_LARGE":"INVALID_INPUT"},tooLarge?413:400);
 }
 const payload=data&&typeof data==="object"&&!Array.isArray(data)?data as {tenantId?:unknown;planId?:unknown;billingCycle?:unknown;transferReference?:unknown}:null;
 const id=typeof payload?.tenantId==="string"?payload.tenantId:"";
 const auth=await merchant(id);if(auth.status!==200)return reply({ok:false,code:"FORBIDDEN"},auth.status);
 if(!uuid(payload?.planId)||(payload?.billingCycle!=="monthly"&&payload?.billingCycle!=="yearly")||typeof payload?.transferReference!=="string"||!/^[\p{L}\p{N} _.:/-]{8,120}$/u.test(payload.transferReference.trim()))return reply({ok:false,code:"INVALID_INPUT"},400);
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [tenant]=await db.execute<RowDataPacket[]>("SELECT id FROM tenants WHERE id=? AND status='active' FOR UPDATE",[id]);
  if(!tenant.length){await db.rollback();return reply({ok:false,code:"TENANT_UNAVAILABLE"},404);}
  const [pending]=await db.execute<RowDataPacket[]>("SELECT id FROM platform_payment_requests WHERE tenant_id=? AND status='pending' LIMIT 1",[id]);
  if(pending.length){await db.rollback();return reply({ok:false,code:"PAYMENT_ALREADY_PENDING"},409);}
  const [prices]=await db.execute<RowDataPacket[]>(
   "SELECT pr.price,pr.currency FROM package_plan_prices pr JOIN package_plans p ON p.id=pr.plan_id AND p.enabled=TRUE AND p.code<>'free' "+
   "JOIN tenant_business_profiles b ON b.tenant_id=? AND b.currency=pr.currency "+
   "WHERE pr.plan_id=? AND pr.billing_cycle=? AND pr.enabled=TRUE AND pr.price>0 LIMIT 1",
   [id,payload.planId,payload.billingCycle]);
  if(!prices.length){await db.rollback();return reply({ok:false,code:"PAID_PLAN_NOT_AVAILABLE"},409);}
  const amount=String(prices[0].price),currency=String(prices[0].currency);
  const requestId=randomUUID();
  await db.execute("INSERT INTO platform_payment_requests(id,tenant_id,plan_id,amount,currency,billing_cycle,transfer_reference,status) VALUES (?,?,?,?,?,?,?,'pending')",
   [requestId,id,payload.planId,amount,currency,payload.billingCycle,payload.transferReference.trim()]);
  await db.commit();
  return reply({ok:true,id:requestId,status:"pending",amount,currency,billingCycle:payload.billingCycle},201);
 }catch{await db.rollback();return reply({ok:false,code:"SUBSCRIPTION_REQUEST_CREATE_FAILED"},503);}finally{db.release();}
}
