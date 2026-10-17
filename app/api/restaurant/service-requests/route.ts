import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {notifyCustomer} from "@/lib/notifications/customer";
import {dispatchNotifications} from "@/lib/notifications/dispatch";
export const runtime="nodejs";
const error=(code:string,status=400)=>NextResponse.json({ok:false,code},{status,headers:{"Cache-Control":"no-store"}});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function authorize(request:Request,write:boolean){
 const user=await currentUserId(),tenant=request.headers.get("x-foon-tenant");
 if(!user||!tenant)return null;
 try{const member=await requireTenantMembership(user,tenant,["owner","manager"],write);return {user,tenantId:member.tenantId};}catch{return null}
}
function allowedTransition(previous:string,next:string,type:string){
 if(previous==="pending")return ["in_review","declined",...(type==="appointment"?["confirmed"]:["responded"])].includes(next);
 if(previous==="in_review")return ["declined",...(type==="appointment"?["confirmed"]:["responded"])].includes(next);
 if(previous==="confirmed")return type==="appointment"&&["completed","cancelled"].includes(next);
 return false;
}
export async function GET(request:Request){
 const ctx=await authorize(request,false);if(!ctx)return error("FORBIDDEN",403);
 const branch=new URL(request.url).searchParams.get("branch")??"";
 if(branch&&!uuid.test(branch))return error("INVALID_BRANCH");
 try{
  const db=database();
  if(branch){
   const [valid]=await db.execute<RowDataPacket[]>("SELECT id FROM branches WHERE tenant_id=? AND id=? LIMIT 1",[ctx.tenantId,branch]);
   if(!valid.length)return error("BRANCH_NOT_FOUND",404);
  }
  const [rows]=await db.execute<RowDataPacket[]>(
   "SELECT id,branch_id,name,status,data,version,created_at FROM restaurant_resources WHERE tenant_id=? AND kind='service_customer_request' AND archived=FALSE"+(branch?" AND branch_id=?":"")+" ORDER BY created_at DESC,id DESC LIMIT 100",
   [ctx.tenantId,...(branch?[branch]:[])]);
  const requests=rows.map(r=>{
   const d=typeof r.data==="string"?JSON.parse(r.data):r.data;
   return {id:String(r.id),branchId:r.branch_id,name:String(r.name),status:String(r.status),version:Number(r.version),
    requestType:String(d.requestType??""),customerName:String(d.customerName??""),customerPhone:String(d.customerPhone??""),
    scheduledAt:d.scheduledAt??null,notes:String(d.notes??""),createdAt:r.created_at};
  });
  return NextResponse.json({ok:true,requests},{headers:{"Cache-Control":"no-store, private"}});
 }catch{return error("REQUESTS_UNAVAILABLE",503)}
}
export async function PATCH(request:Request){
 try{assertSameOrigin(request)}catch{return error("FORBIDDEN",403)}
 const ctx=await authorize(request,true);if(!ctx)return error("FORBIDDEN",403);
 const body=await request.json().catch(()=>null);
 if(!body||!uuid.test(body.id??"")||!Number.isSafeInteger(body.version)||body.version<1||typeof body.status!=="string")return error("INVALID_INPUT");
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [rows]=await db.execute<RowDataPacket[]>("SELECT status,version,name,data FROM restaurant_resources WHERE tenant_id=? AND id=? AND kind='service_customer_request' AND archived=FALSE FOR UPDATE",[ctx.tenantId,body.id]);
  if(!rows.length){await db.rollback();return error("REQUEST_NOT_FOUND",404)}
  const row=rows[0],data=typeof row.data==="string"?JSON.parse(row.data):row.data;
  if(Number(row.version)!==body.version){await db.rollback();return error("CONFLICT",409)}
  if(!allowedTransition(String(row.status),body.status,String(data.requestType))){await db.rollback();return error("INVALID_TRANSITION",409)}
  await db.execute("UPDATE restaurant_resources SET status=?,version=version+1 WHERE tenant_id=? AND id=? AND version=?",[body.status,ctx.tenantId,body.id,body.version]);
  await db.execute("INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id,metadata) VALUES (?,?,'service_customer_request.status',?,?)",[ctx.tenantId,ctx.user,body.id,JSON.stringify({from:row.status,to:body.status})]);
  if(typeof data.customerUserId==="string")await notifyCustomer(db,{userId:data.customerUserId,tenantId:ctx.tenantId,event:"service_request_"+body.status,resourceId:body.id,reference:String(body.id).slice(0,8),status:body.status});
  await db.commit();dispatchNotifications();
  return NextResponse.json({ok:true,status:body.status});
 }catch{await db.rollback();return error("REQUEST_UPDATE_FAILED",503)}finally{db.release()}
}
