import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {requireAllAdditionalBranchesUnlocked} from "@/lib/restaurant/branch-pin";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
const idPattern=/^[a-f0-9-]{36}$/i;
async function context(req:Request,write=false){
 const uid=await currentUserId();if(!uid)return {error:NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401})};
 const branch=new URL(req.url).searchParams.get("branch"),tenant=req.headers.get("x-foon-tenant");
 if(!branch||!tenant||!idPattern.test(branch))return {error:NextResponse.json({ok:false,code:"BRANCH_REQUIRED"},{status:400})};
 try{
  const m=await requireTenantMembership(uid,tenant,write?["owner","manager"]:["owner","manager","waiter"],write);
  if(write)await requireAllAdditionalBranchesUnlocked(m.tenantId,uid);
  const [rows]=await database().execute<RowDataPacket[]>("SELECT id FROM branches WHERE tenant_id=? AND id=? AND enabled=TRUE LIMIT 1",[m.tenantId,branch]);
  if(!rows.length)return {error:NextResponse.json({ok:false,code:"BRANCH_NOT_FOUND"},{status:404})};
  return {tenant:m.tenantId,branch,uid,manager:m.role==="owner"||m.role==="manager"};
 }catch{return {error:NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}}
}
export async function GET(req:Request){
 const c=await context(req);if(c.error)return c.error;
 try{
  const [assignments]=await database().execute<RowDataPacket[]>("SELECT section_id,user_id,duty FROM restaurant_section_staff_assignments WHERE tenant_id=? AND branch_id=?"+(c.manager?"":" AND user_id=?"),c.manager?[c.tenant,c.branch]:[c.tenant,c.branch,c.uid]);
  const [staff]=c.manager?await database().execute<RowDataPacket[]>("SELECT m.user_id,m.role,COALESCE(NULLIF(u.display_name,''),u.email) AS name FROM memberships m JOIN users u ON u.id=m.user_id AND u.status='active' WHERE m.tenant_id=? AND m.status='active' AND m.role IN ('owner','manager','waiter') ORDER BY name LIMIT 500",[c.tenant]):[[] as RowDataPacket[]];
  const [alerts]=await database().execute<RowDataPacket[]>("SELECT a.id,a.section_id,a.layout_id,a.floor_table_id,a.status,a.created_at FROM restaurant_section_host_alerts a WHERE a.tenant_id=? AND a.branch_id=?"+(c.manager?"":" AND EXISTS(SELECT 1 FROM restaurant_section_staff_assignments s WHERE s.tenant_id=a.tenant_id AND s.branch_id=a.branch_id AND s.section_id=a.section_id AND s.user_id=? AND s.duty='host')")+" ORDER BY a.id DESC LIMIT 50",c.manager?[c.tenant,c.branch]:[c.tenant,c.branch,c.uid]);
  return NextResponse.json({ok:true,assignments:assignments.map(x=>({sectionId:String(x.section_id),userId:String(x.user_id),duty:String(x.duty)})),staff:staff.map(x=>({id:String(x.user_id),role:String(x.role),name:String(x.name)})),alerts:alerts.map(x=>({id:String(x.id),sectionId:String(x.section_id),layoutId:String(x.layout_id),tableId:String(x.floor_table_id),status:String(x.status),createdAt:x.created_at}))},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({ok:false,code:"SECTION_STAFF_UNAVAILABLE"},{status:503})}
}
export async function PUT(req:Request){
 try{assertSameOrigin(req)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const c=await context(req,true);if(c.error)return c.error;
 let data:unknown;try{data=await readLimitedJson(req,8192)}catch{return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400})}
 if(!data||typeof data!=="object")return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const v=data as {sectionId?:unknown;assignments?:unknown};
 if(typeof v.sectionId!=="string"||!idPattern.test(v.sectionId)||!Array.isArray(v.assignments)||v.assignments.length>100)return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const entries=v.assignments as {userId?:unknown;duty?:unknown}[];
 if(entries.some(x=>!x||typeof x.userId!=="string"||!idPattern.test(x.userId)||!["waiter","host"].includes(String(x.duty))))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const unique=new Set(entries.map(x=>x.userId+":"+x.duty));if(unique.size!==entries.length)return NextResponse.json({ok:false,code:"DUPLICATE_ASSIGNMENT"},{status:400});
 const db=await database().getConnection();try{
  await db.beginTransaction();
  const [sections]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND id=? AND kind='dining_section' AND archived=FALSE AND status='active' AND (branch_id=? OR branch_id IS NULL) LIMIT 1 FOR UPDATE",[c.tenant,v.sectionId,c.branch]);
  if(!sections.length){await db.rollback();return NextResponse.json({ok:false,code:"SECTION_NOT_FOUND"},{status:404})}
  for(const x of entries){
   const [valid]=await db.execute<RowDataPacket[]>("SELECT user_id FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' AND role IN ('owner','manager','waiter') LIMIT 1",[c.tenant,x.userId]);
   if(!valid.length){await db.rollback();return NextResponse.json({ok:false,code:"STAFF_NOT_AUTHORIZED"},{status:403})}
  }
  await db.execute("DELETE FROM restaurant_section_staff_assignments WHERE tenant_id=? AND branch_id=? AND section_id=?",[c.tenant,c.branch,v.sectionId]);
  for(const x of entries)await db.execute("INSERT INTO restaurant_section_staff_assignments(tenant_id,branch_id,section_id,user_id,duty) VALUES(?,?,?,?,?)",[c.tenant,c.branch,v.sectionId,x.userId,x.duty]);
  await db.commit();return NextResponse.json({ok:true});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"SECTION_STAFF_SAVE_FAILED"},{status:503})}finally{db.release()}
}
