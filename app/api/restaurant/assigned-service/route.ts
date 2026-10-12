import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
export const runtime="nodejs";
export async function GET(request:Request){
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const tenantId=new URL(request.url).searchParams.get("tenantId")??"";
 if(!/^[a-f0-9-]{36}$/i.test(tenantId))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{await requireTenantMembership(user,tenantId,["owner","manager","waiter","cashier","kitchen","driver","accountant"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 try{
  const db=database();
  const [employees]=await db.execute<RowDataPacket[]>("SELECT id,branch_id FROM restaurant_resources WHERE tenant_id=? AND kind='employee' AND archived=FALSE AND (JSON_UNQUOTE(JSON_EXTRACT(data,'$.userId'))=? OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(data,'$.email')))=(SELECT LOWER(email) FROM users WHERE id=? LIMIT 1))",[tenantId,user,user]);
  if(!employees.length)return NextResponse.json({ok:true,tables:[],calls:[],assignmentStatus:"EMPLOYEE_PROFILE_NOT_LINKED"});
  const employeeIds=[...new Set([...employees.map(e=>String(e.id)),String(user)])];
  const parse=(value:unknown):Record<string,unknown>=>{try{return (typeof value==="string"?JSON.parse(value):value) as Record<string,unknown>??{};}catch{return {};}};
  const [sections]=await db.execute<RowDataPacket[]>("SELECT id,branch_id,data FROM restaurant_resources WHERE tenant_id=? AND kind='dining_section' AND archived=FALSE",[tenantId]);
  const mySections=new Set(sections.filter(section=>employeeIds.includes(String(parse(section.data).waiterId??""))).map(section=>String(section.id)));
  const [assignments]=await db.execute<RowDataPacket[]>("SELECT branch_id FROM employee_branch_assignments WHERE tenant_id=? AND user_id=? AND enabled=TRUE",[tenantId,user]);
  const myBranches=new Set(assignments.map(row=>String(row.branch_id)));
  // Legacy employee profiles may predate the branch-assignment migration.
  if(!myBranches.size)for(const employee of employees)if(employee.branch_id)myBranches.add(String(employee.branch_id));
  const [tables]=await db.execute<RowDataPacket[]>("SELECT id,name,status,branch_id,data FROM restaurant_resources WHERE tenant_id=? AND kind='dining_table' AND archived=FALSE",[tenantId]);
  const mine=tables.filter(t=>{const details=parse(t.data);return (myBranches.has(String(t.branch_id))||t.branch_id==null&&myBranches.size>0)&&(employeeIds.includes(String(details.waiterId??""))||(!details.waiterId&&mySections.has(String(details.sectionId??""))));});
  const tableIds=new Set(mine.map(t=>String(t.id)));
  const tableNumbers=new Set(mine.map(t=>String(parse(t.data).number??"")).filter(Boolean));
  const [calls]=await db.execute<RowDataPacket[]>("SELECT id,name,status,branch_id,data FROM restaurant_resources WHERE tenant_id=? AND kind='waiter_call' AND archived=FALSE AND status IN ('pending','in_progress','new','requested','open')",[tenantId]);
  return NextResponse.json({ok:true,assignmentStatus:!myBranches.size?"NO_BRANCH_ASSIGNMENT":mine.length?"ASSIGNED":"NO_MATCHING_TABLE_ASSIGNMENT",tables:mine.map(t=>({id:t.id,name:t.name,status:t.status,branchId:t.branch_id})),calls:calls.filter(c=>{const d=typeof c.data==="string"?JSON.parse(c.data):c.data;return tableIds.has(String(d?.tableId??""))||(c.branch_id!=null&&myBranches.has(String(c.branch_id))&&tableNumbers.has(String(d?.tableNumber??d?.table_number??"")));}).map(c=>({id:c.id,name:c.name,status:c.status}))});
 }catch(error){console.error("[FOON assigned service]",error);return NextResponse.json({ok:false,code:"ASSIGNED_SERVICE_UNAVAILABLE"},{status:503});}
}
