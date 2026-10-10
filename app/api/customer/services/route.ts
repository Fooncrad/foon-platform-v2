import {createHash} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {tenantEntitlement} from "@/lib/plans/entitlements";
import {saveResource} from "@/lib/restaurant/operations";
import {ResourceError} from "@/scripts/restaurant-resource-schema.mjs";
export const runtime="nodejs";
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const body=await request.json().catch(()=>null);
 if(!body||typeof body.storeSlug!=="string"||!['waiter','reservation'].includes(body.action)||typeof body.branchId!=="string"||typeof body.requestKey!=="string"||!/^[a-f0-9-]{36}$/i.test(body.requestKey))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{
  await db.query("SET time_zone='+00:00'");await db.beginTransaction();
  // Serialize submissions by this customer; retries and concurrent clicks cannot create duplicates.
  const [users]=await db.execute<RowDataPacket[]>("SELECT display_name FROM users WHERE id=? AND status='active' FOR UPDATE",[user]);
  const [stores]=await db.execute<RowDataPacket[]>("SELECT t.id FROM tenants t JOIN tenant_customers c ON c.tenant_id=t.id AND c.user_id=? WHERE t.slug=? AND t.status='active' LIMIT 1 LOCK IN SHARE MODE",[user,body.storeSlug]);
  if(!users.length||!stores.length)throw new ResourceError("STORE_CUSTOMER_REQUIRED");
  const tenant=String(stores[0].id),waiter=body.action==='waiter',serviceModule=waiter?'waiterCalls':'reservations',kind=waiter?'waiter_call':'reservation';
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
  const data=waiter?{tableId:body.tableId,sectionId:body.sectionId||null,notes}:{tableId:null,sectionId:null,phone:body.phone.trim(),partySize:body.partySize,scheduledAt:new Date(body.scheduledAt).toISOString(),notes};
  
  const fingerprint=createHash('sha256').update(JSON.stringify({branchId:body.branchId,data})).digest('hex'),lookup=user+':'+body.requestKey;
  const [existing]=await db.execute<RowDataPacket[]>("SELECT id,JSON_UNQUOTE(JSON_EXTRACT(data,'$.requestFingerprint')) AS fingerprint FROM restaurant_resources WHERE tenant_id=? AND kind=? AND lookup_key=? FOR UPDATE",[tenant,kind,lookup]);
  if(existing.length){if(existing[0].fingerprint!==fingerprint)throw new ResourceError("CONFLICT");await db.commit();return NextResponse.json({ok:true,id:existing[0].id},{status:200});}
  const [[recent]]=await db.execute<RowDataPacket[]>("SELECT COUNT(*) AS n FROM restaurant_audit_events WHERE tenant_id=? AND actor_user_id=? AND action=? AND created_at>DATE_SUB(NOW(),INTERVAL 1 MINUTE)",[tenant,user,serviceModule+'.save']);
  if(Number(recent.n)>=1)throw new ResourceError("RATE_LIMITED");
  // Customers may only create their own pending service requests. They receive no staff role or update permission.
  const result=await saveResource(db,tenant,user,'owner',serviceModule,{name:String(users[0].display_name||'عميل'),branchId:body.branchId,status:'pending',data});
  await db.execute("UPDATE restaurant_resources SET lookup_key=?,data=JSON_SET(data,'$.requestFingerprint',?,'$.customerUserId',?) WHERE id=? AND tenant_id=?",[lookup,fingerprint,user,result.id,tenant]);
  await db.commit();return NextResponse.json({ok:true,id:result.id},{status:201});
 }catch(error){await db.rollback();const code=error instanceof ResourceError?error.code:'SERVICE_UNAVAILABLE';return NextResponse.json({ok:false,code},{status:code==='RATE_LIMITED'?429:code==='REFERENCE_NOT_FOUND'||code==='BRANCH_NOT_FOUND'?404:code==='STORE_CUSTOMER_REQUIRED'||code==='PLAN_FEATURE_REQUIRED'?403:code==='SERVICE_UNAVAILABLE'?503:400});}finally{db.release();}
}
