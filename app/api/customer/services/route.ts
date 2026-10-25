import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {notifyCustomer} from "@/lib/notifications/customer";
import {dispatchNotifications} from "@/lib/notifications/dispatch";
import {createHash} from "node:crypto";
import {NextResponse} from "next/server";
import type {NextRequest} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {activeCustomerAccount} from "@/lib/auth/active-customer-account.mjs";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
import {tenantEntitlement} from "@/lib/plans/entitlements";
import {tenantPublicControls} from "@/lib/tenant/public-controls";
import {saveResource} from "@/lib/restaurant/operations";
import {ResourceError} from "@/scripts/restaurant-resource-schema.mjs";
export const runtime="nodejs";
export async function GET(request:NextRequest){
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const storeSlug=request.nextUrl.searchParams.get("storeSlug");if(!storeSlug||storeSlug.length>120)return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{
  if(!await activeCustomerAccount(db,user))return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401,headers:{"Cache-Control":"no-store"}});
  const [stores]=await db.execute<RowDataPacket[]>("SELECT t.id FROM tenants t JOIN tenant_customers c ON c.tenant_id=t.id AND c.user_id=? WHERE t.slug=? AND t.status='active' LIMIT 1",[user,storeSlug]);
  if(!stores.length)return NextResponse.json({ok:false,code:"STORE_CUSTOMER_REQUIRED"},{status:403});
  const tenant=String(stores[0].id);
  const [rows]=await db.execute<RowDataPacket[]>("SELECT id,branch_id,name,status,data FROM restaurant_resources WHERE tenant_id=? AND kind='reservation' AND archived=FALSE AND status IN ('pending','confirmed') AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.customerUserId'))=? ORDER BY created_at DESC LIMIT 100",[tenant,user]);
  const reservations=rows.flatMap(row=>{const data=typeof row.data==="string"?JSON.parse(row.data):row.data;const scheduledAt=typeof data?.scheduledAt==="string"?data.scheduledAt:"";const time=Date.parse(scheduledAt);if(!Number.isFinite(time)||time<=Date.now())return [];return [{id:String(row.id),branchId:String(row.branch_id??""),name:String(row.name),status:String(row.status),scheduledAt,partySize:Number(data.partySize)}];});
  return NextResponse.json({ok:true,reservations});
 }catch{return NextResponse.json({ok:false,code:"SERVICE_UNAVAILABLE"},{status:503});}finally{db.release();}
}
export async function POST(request:Request){
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 let parsed:unknown;
 try{parsed=await readLimitedJson(request,16384);}
 catch(error){const oversized=error instanceof Error&&error.message==="BATCH_TOO_LARGE";return NextResponse.json({ok:false,code:oversized?"BODY_TOO_LARGE":"INVALID_INPUT"},{status:oversized?413:400,headers:{"Cache-Control":"no-store"}});}
 const body=parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as {storeSlug:string;action:string;branchId:string;requestKey:string;notes?:string;tableId?:string;sectionId?:string;scheduledAt:string;partySize:number;phone:string}:null;
 if(!body||typeof body.storeSlug!=="string"||!['waiter','reservation'].includes(body.action)||typeof body.branchId!=="string"||typeof body.requestKey!=="string"||!/^[a-f0-9-]{36}$/i.test(body.requestKey))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{
  await db.query("SET time_zone='+00:00'");await db.beginTransaction();
  // Serialize submissions by this customer; retries and concurrent clicks cannot create duplicates.
  const [users]=await db.execute<RowDataPacket[]>("SELECT display_name,email_verified_at FROM users WHERE id=? AND status='active' FOR UPDATE",[user]);
  const [stores]=await db.execute<RowDataPacket[]>("SELECT t.id FROM tenants t JOIN tenant_customers c ON c.tenant_id=t.id AND c.user_id=? WHERE t.slug=? AND t.status='active' LIMIT 1 LOCK IN SHARE MODE",[user,body.storeSlug]);
  if(!users.length||!stores.length)throw new ResourceError("STORE_CUSTOMER_REQUIRED");
  if(body.action==="reservation"&&!users[0].email_verified_at)throw new ResourceError("EMAIL_VERIFICATION_REQUIRED");
  const tenant=String(stores[0].id),waiter=body.action==='waiter',serviceModule=waiter?'waiterCalls':'reservations',kind=waiter?'waiter_call':'reservation';
   const publicControls=await tenantPublicControls(tenant,db);
   if(!(waiter?publicControls.waiter:publicControls.reservations))throw new ResourceError("PUBLIC_FEATURE_DISABLED");
  if(!(await tenantEntitlement(tenant,waiter?'tables':'reservations')).enabled)throw new ResourceError("PLAN_FEATURE_REQUIRED");
  const notes=typeof body.notes==='string'?body.notes.trim():'';
  if(notes.length>500)throw new ResourceError("INVALID_INPUT");
  if(waiter){
   if(typeof body.tableId!=='string')throw new ResourceError("INVALID_INPUT");
   const [tables]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND id=? AND kind='dining_table' AND archived=FALSE AND status<>'inactive' AND (branch_id=? OR branch_id IS NULL) LIMIT 1 LOCK IN SHARE MODE",[tenant,body.tableId,body.branchId]);
   if(!tables.length)throw new ResourceError("REFERENCE_NOT_FOUND");
  }else{
   const date=typeof body.scheduledAt==='string'?Date.parse(body.scheduledAt):NaN;
   if(!Number.isFinite(date)||date<Date.now()+15*60*1000||date>Date.now()+90*86400000||!Number.isInteger(body.partySize)||body.partySize<1||body.partySize>100||typeof body.phone!=='string'||(!/^\+?[\d ()-]{7,40}$/.test(body.phone)||body.phone.replace(/\D/g,'').length<7))throw new ResourceError("INVALID_INPUT");
  }
  if(!waiter){
   if(typeof body.sectionId!=="string"||!body.sectionId)throw new ResourceError("SECTION_REQUIRED");
   const [sections]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND id=? AND kind='dining_section' AND archived=FALSE AND status='active' AND (branch_id=? OR branch_id IS NULL) LIMIT 1",[tenant,body.sectionId,body.branchId]);
   if(!sections.length)throw new ResourceError("SECTION_NOT_FOUND");
  }
  const data=waiter?{tableId:body.tableId,sectionId:body.sectionId||null,notes}:{tableId:null,sectionId:body.sectionId,phone:body.phone.trim(),partySize:body.partySize,scheduledAt:new Date(body.scheduledAt).toISOString(),notes};
  
  const fingerprint=createHash('sha256').update(JSON.stringify({branchId:body.branchId,data})).digest('hex'),lookup=user+':'+body.requestKey;
  const [existing]=await db.execute<RowDataPacket[]>("SELECT id,JSON_UNQUOTE(JSON_EXTRACT(data,'$.requestFingerprint')) AS fingerprint FROM restaurant_resources WHERE tenant_id=? AND kind=? AND lookup_key=? FOR UPDATE",[tenant,kind,lookup]);
  if(existing.length){if(existing[0].fingerprint!==fingerprint)throw new ResourceError("CONFLICT");await db.commit();return NextResponse.json({ok:true,id:existing[0].id},{status:200});}
  const [[recent]]=await db.execute<RowDataPacket[]>("SELECT COUNT(*) AS n FROM restaurant_audit_events WHERE tenant_id=? AND actor_user_id=? AND action=? AND created_at>DATE_SUB(NOW(),INTERVAL 1 MINUTE)",[tenant,user,serviceModule+'.save']);
  if(Number(recent.n)>=1)throw new ResourceError("RATE_LIMITED");
  // Customers may only create their own pending service requests. They receive no staff role or update permission.
  const result=await saveResource(db,tenant,user,'owner',serviceModule,{name:String(users[0].display_name||'عميل'),branchId:body.branchId,status:'pending',data});
  await db.execute("UPDATE restaurant_resources SET lookup_key=?,data=JSON_SET(data,'$.requestFingerprint',?,'$.customerUserId',?) WHERE id=? AND tenant_id=?",[lookup,fingerprint,user,result.id,tenant]);
  if(!waiter)await notifyCustomer(db,{userId:user,tenantId:tenant,event:"reservation_created",resourceId:result.id,reference:String(users[0].display_name??""),status:"pending"});
  await db.commit();dispatchNotifications();return NextResponse.json({ok:true,id:result.id},{status:201});
 }catch(error){await db.rollback();const code=error instanceof ResourceError?error.code:'SERVICE_UNAVAILABLE';return NextResponse.json({ok:false,code},{status:code==='RATE_LIMITED'?429:code==='REFERENCE_NOT_FOUND'||code==='BRANCH_NOT_FOUND'?404:code==='EMAIL_VERIFICATION_REQUIRED'||code==='STORE_CUSTOMER_REQUIRED'||code==='PLAN_FEATURE_REQUIRED'||code==='PUBLIC_FEATURE_DISABLED'?403:code==='SERVICE_UNAVAILABLE'?503:400});}finally{db.release();}
}
