import {createHash,randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {database} from "@/lib/db/mysql";
import {tenantEntitlement} from "@/lib/plans/entitlements";
import {tenantPublicControls} from "@/lib/tenant/public-controls";
import {assertSameOrigin} from "@/lib/security/origin";
import {validStoreSlug} from "@/scripts/store-slug.mjs";
import {notifyCustomer} from "@/lib/notifications/customer";
import {dispatchNotifications} from "@/lib/notifications/dispatch";
import {SERVICE_BUSINESSES,serviceRequestTypeAllowed,validServiceAppointmentTime,validServiceRequestPhone} from "@/lib/platform/service-request-policy";
export const runtime="nodejs";
const fail=(code:string,status=400)=>NextResponse.json({ok:false,code},{status,headers:{"Cache-Control":"no-store"}});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function customerScope(db:Pick<ReturnType<typeof database>,"execute">,user:string,slug:string){
 const [rows]=await db.execute<RowDataPacket[]>(
  "SELECT t.id,p.activity_code FROM tenants t JOIN tenant_customers c ON c.tenant_id=t.id AND c.user_id=? JOIN tenant_business_profiles p ON p.tenant_id=t.id WHERE t.slug=? AND t.status='active' LIMIT 1",
  [user,slug]);
 if(!rows.length)return null;
 const activity=String(rows[0].activity_code);
 return SERVICE_BUSINESSES.has(activity)?{tenantId:String(rows[0].id),activity}:null;
}
export async function GET(request:Request){
 const denied=await employeePersonalAccessDenied();if(denied)return denied;
 const user=await currentUserId();if(!user)return fail("UNAUTHENTICATED",401);
 const slug=new URL(request.url).searchParams.get("storeSlug")?.trim().toLowerCase()??"";
 if(!validStoreSlug(slug))return fail("INVALID_INPUT");
 try{
  const db=database(),ctx=await customerScope(db,user,slug);
  if(!ctx)return fail("STORE_CUSTOMER_REQUIRED",403);
  const [rows]=await db.execute<RowDataPacket[]>(
   "SELECT id,name,status,data,created_at,updated_at FROM restaurant_resources WHERE tenant_id=? AND kind='service_customer_request' AND archived=FALSE AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.customerUserId'))=? ORDER BY created_at DESC LIMIT 50",
   [ctx.tenantId,user]);
  return NextResponse.json({ok:true,requests:rows.map(r=>{const data=typeof r.data==="string"?JSON.parse(r.data):r.data;return {id:r.id,name:r.name,status:r.status,requestType:data.requestType,scheduledAt:data.scheduledAt,createdAt:r.created_at,updatedAt:r.updated_at};})},{headers:{"Cache-Control":"no-store, private"}});
 }catch{return fail("SERVICE_REQUESTS_UNAVAILABLE",503)}
}
export async function POST(request:Request){
 const denied=await employeePersonalAccessDenied();if(denied)return denied;
 try{assertSameOrigin(request)}catch{return fail("FORBIDDEN",403)}
 const user=await currentUserId();if(!user)return fail("UNAUTHENTICATED",401);
 const body=await request.json().catch(()=>null);
 const slug=typeof body?.storeSlug==="string"?body.storeSlug.trim().toLowerCase():"";
 const type=body?.requestType;
 const note=body?.notes;
 const phone=body?.phone;
 if(!validStoreSlug(slug)||!uuid.test(body?.serviceId??"")||!uuid.test(body?.requestKey??"")||
  !["inquiry","appointment","quote"].includes(type)||typeof note!=="string"||note.length>1000||
  !validServiceRequestPhone(phone))
  return fail("INVALID_INPUT");
 const scheduled=type==="appointment"?Date.parse(body.scheduledAt):null;
 if(type==="appointment"&&!validServiceAppointmentTime(body.scheduledAt))return fail("INVALID_APPOINTMENT_TIME");
 const pool=database(),db=await pool.getConnection();
 try{
  await db.beginTransaction();
  // Lock customer account to serialize retries and avoid concurrent double submissions.
  const [users]=await db.execute<RowDataPacket[]>("SELECT display_name FROM users WHERE id=? AND status='active' FOR UPDATE",[user]);
  const ctx=await customerScope(db,user,slug);
  if(!users.length||!ctx) {await db.rollback();return fail("STORE_CUSTOMER_REQUIRED",403)}
   if(!(await tenantPublicControls(ctx.tenantId,db)).serviceRequests){await db.rollback();return fail("PUBLIC_FEATURE_DISABLED",403)}
  if(!serviceRequestTypeAllowed(ctx.activity,type,true)) {await db.rollback();return fail("UNSUPPORTED_REQUEST_TYPE")}
  if(!(await tenantEntitlement(ctx.tenantId,"catalog",db)).enabled) {await db.rollback();return fail("PLAN_FEATURE_REQUIRED",403)}
  if(type==="appointment"&&!(await tenantEntitlement(ctx.tenantId,"appointments",db)).enabled){await db.rollback();return fail("PLAN_FEATURE_REQUIRED",403)}
  const [services]=await db.execute<RowDataPacket[]>(
   "SELECT p.name_ar FROM catalog_products p JOIN catalog_categories c ON c.id=p.category_id AND c.tenant_id=p.tenant_id AND c.enabled=TRUE WHERE p.tenant_id=? AND p.id=? AND p.product_type='service' AND p.enabled=TRUE LIMIT 1 LOCK IN SHARE MODE",
   [ctx.tenantId,body.serviceId]);
  if(!services.length){await db.rollback();return fail("SERVICE_NOT_FOUND",404)}
  const [branches]=await db.execute<RowDataPacket[]>("SELECT id FROM branches WHERE tenant_id=? AND enabled=TRUE ORDER BY created_at,id LIMIT 1",[ctx.tenantId]);
  if(!branches.length){await db.rollback();return fail("NO_ACTIVE_BRANCH",409)}
  const branchId=String(branches[0].id);
  const data={customerUserId:user,serviceId:body.serviceId,serviceName:String(services[0].name_ar),customerName:String(users[0].display_name||"عميل"),customerPhone:phone.trim(),requestType:type,scheduledAt:type==="appointment"?new Date(scheduled!).toISOString():null,notes:note.trim()};
  const fingerprint=createHash("sha256").update(JSON.stringify(data)).digest("hex");
  const lookup=user+":"+body.requestKey;
  const [existing]=await db.execute<RowDataPacket[]>("SELECT id,JSON_UNQUOTE(JSON_EXTRACT(data,'$.requestFingerprint')) AS fingerprint FROM restaurant_resources WHERE tenant_id=? AND kind='service_customer_request' AND lookup_key=? FOR UPDATE",[ctx.tenantId,lookup]);
  if(existing.length){
   if(existing[0].fingerprint!==fingerprint){await db.rollback();return fail("REQUEST_KEY_CONFLICT",409)}
   await db.commit();return NextResponse.json({ok:true,id:existing[0].id,reused:true});
  }
  const [[rate]]=await db.execute<RowDataPacket[]>("SELECT COUNT(*) AS n FROM restaurant_audit_events WHERE tenant_id=? AND actor_user_id=? AND action='customer.service_request.create' AND created_at>DATE_SUB(NOW(),INTERVAL 1 HOUR)",[ctx.tenantId,user]);
  if(Number(rate.n)>=6){await db.rollback();return fail("RATE_LIMITED",429)}
  const id=randomUUID();
  await db.execute("INSERT INTO restaurant_resources(id,tenant_id,branch_id,kind,name,status,data,lookup_key) VALUES (?,?,?,'service_customer_request',?,'pending',?,?)",[id,ctx.tenantId,branchId,data.serviceName,JSON.stringify({...data,requestFingerprint:fingerprint}),lookup]);
  await db.execute("INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id,metadata) VALUES (?,?, 'customer.service_request.create',?,?)",[ctx.tenantId,user,id,JSON.stringify({type,serviceId:body.serviceId})]);
  await notifyCustomer(db,{userId:user,tenantId:ctx.tenantId,event:"service_request_created",resourceId:id,reference:id.slice(0,8),status:"pending"});
  await db.commit();
  dispatchNotifications();
  return NextResponse.json({ok:true,id},{status:201});
 }catch{await db.rollback();return fail("SERVICE_REQUEST_SAVE_FAILED",503)}finally{db.release()}
}
