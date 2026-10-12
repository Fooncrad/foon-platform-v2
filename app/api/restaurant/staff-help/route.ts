import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket,ResultSetHeader} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
export const runtime="nodejs";
const roles=["owner","manager","waiter","cashier","kitchen","driver","accountant"] as const;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function context(tenantId:string,user:string){
 const membership=await requireTenantMembership(user,tenantId,roles);
 const db=database();
 const [assigned]=await db.execute<RowDataPacket[]>("SELECT branch_id FROM employee_branch_assignments WHERE tenant_id=? AND user_id=? AND enabled=TRUE",[tenantId,user]);
 const branches=[...new Set(assigned.map(r=>String(r.branch_id)))];
 if(!branches.length&&membership.role!=="owner"){
  const [legacy]=await db.execute<RowDataPacket[]>("SELECT branch_id FROM restaurant_resources WHERE tenant_id=? AND kind='employee' AND archived=FALSE AND branch_id IS NOT NULL AND (JSON_UNQUOTE(JSON_EXTRACT(data,'$.userId'))=? OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(data,'$.email')))=(SELECT LOWER(email) FROM users WHERE id=? LIMIT 1))",[tenantId,user,user]);
  branches.push(...legacy.map(r=>String(r.branch_id)));
 }
 return {role:membership.role,branches:[...new Set(branches)],db};
}
export async function GET(request:Request){
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false},{status:401});
 const q=new URL(request.url).searchParams,tenantId=q.get("tenantId")??"";
 if(!uuid.test(tenantId))return NextResponse.json({ok:false},{status:400});
 try{
  const {role,branches,db}=await context(tenantId,user);
  if(role!=="owner"&&!branches.length)return NextResponse.json({ok:true,requests:[]});
  const manager=role==="owner"||role==="manager";
  const [rows]=await db.execute<RowDataPacket[]>(
   "SELECT id,branch_id,name,status,data,created_at FROM restaurant_resources WHERE tenant_id=? AND kind='staff_help' AND archived=FALSE ORDER BY created_at DESC LIMIT 100",[tenantId]);
  const requests=rows.filter(r=>(role==="owner"||branches.includes(String(r.branch_id)))&&(manager||String((typeof r.data==="string"?JSON.parse(r.data):r.data)?.requesterId??"")===user)).map(r=>({id:r.id,branchId:r.branch_id,description:r.name,status:r.status,createdAt:r.created_at,requesterId:(typeof r.data==="string"?JSON.parse(r.data):r.data)?.requesterId}));
  return NextResponse.json({ok:true,requests});
 }catch{return NextResponse.json({ok:false},{status:403});}
}
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false},{status:403});}
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false},{status:401});
 const body=await request.json().catch(()=>null) as {tenantId?:string;branchId?:string;description?:string;id?:string;action?:string}|null;
 if(!body||!uuid.test(body.tenantId??""))return NextResponse.json({ok:false},{status:400});
 try{
  const tenantId=String(body.tenantId);
  const {role,branches,db}=await context(tenantId,user);
  if(body.action==="resolve"){
   if(!["owner","manager"].includes(role)||!uuid.test(body.id??""))return NextResponse.json({ok:false},{status:403});
   const callId=String(body.id);
   const [existing]=await db.execute<RowDataPacket[]>("SELECT branch_id FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='staff_help' AND archived=FALSE AND status='pending'",[callId,tenantId]);
   if(!existing.length||(role!=="owner"&&!branches.includes(String(existing[0].branch_id))))return NextResponse.json({ok:false},{status:403});
   const [updated]=await db.execute<ResultSetHeader>("UPDATE restaurant_resources SET status='resolved',updated_at=NOW() WHERE id=? AND tenant_id=? AND kind='staff_help' AND status='pending'",[callId,tenantId]);
   if(updated.affectedRows!==1)return NextResponse.json({ok:false},{status:409});
   await db.execute("INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id,metadata) VALUES (?,?,?,?,?)",[tenantId,user,"staff_help.resolve",callId,JSON.stringify({branchId:existing[0].branch_id})]);
   return NextResponse.json({ok:true});
  }
  const branchId=body.branchId??"",description=String(body.description??"").trim();
  if(!uuid.test(branchId)||description.length<5||description.length>500||(role!=="owner"&&!branches.includes(branchId)))return NextResponse.json({ok:false},{status:400});
  const [exists]=await db.execute<RowDataPacket[]>("SELECT id FROM branches WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[branchId,tenantId]);
  if(!exists.length)return NextResponse.json({ok:false},{status:403});
  const id=randomUUID();
  await db.execute("INSERT INTO restaurant_resources(id,tenant_id,branch_id,kind,name,status,data,lookup_key) VALUES (?,?,?,?,?,?,?,?)",[id,tenantId,branchId,"staff_help",description,"pending",JSON.stringify({requesterId:user}),id]);
  await db.execute("INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id,metadata) VALUES (?,?,?,?,?)",[tenantId,user,"staff_help.request",id,JSON.stringify({branchId})]);
  return NextResponse.json({ok:true,id},{status:201});
 }catch{return NextResponse.json({ok:false},{status:503});}
}
