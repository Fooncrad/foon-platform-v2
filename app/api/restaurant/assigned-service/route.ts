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
  const hasExplicitAssignments=assignments.length>0;
  // Legacy employee profiles may predate the branch-assignment migration.
  if(!hasExplicitAssignments)for(const employee of employees)if(employee.branch_id)myBranches.add(String(employee.branch_id));
  const [tables]=await db.execute<RowDataPacket[]>("SELECT id,name,status,branch_id,data FROM restaurant_resources WHERE tenant_id=? AND kind='dining_table' AND archived=FALSE",[tenantId]);
  const mine=tables.filter(t=>{
   const details=parse(t.data);
   const section=sections.find(section=>String(section.id)===String(details.sectionId??""));
   const tableBranch=String(t.branch_id??section?.branch_id??"");
   if(!tableBranch||!myBranches.has(tableBranch))return false;
   const explicit=String(details.waiterId??"");
   // Explicit table assignment overrides the hall default.
   return explicit?employeeIds.includes(explicit):Boolean(section&&mySections.has(String(section.id))&&String(section.branch_id??"")===tableBranch);
  });
  const [calls]=await db.execute<RowDataPacket[]>("SELECT id,name,status,branch_id,data FROM restaurant_resources WHERE tenant_id=? AND kind='waiter_call' AND archived=FALSE AND status IN ('pending','in_progress','new','requested','open')",[tenantId]);
  return NextResponse.json({ok:true,assignmentStatus:!myBranches.size?"NO_BRANCH_ASSIGNMENT":mine.length?"ASSIGNED":"NO_MATCHING_TABLE_ASSIGNMENT",tables:mine.map(t=>({id:t.id,name:t.name,status:t.status,branchId:t.branch_id})),calls:calls.filter(c=>{const d=parse(c.data);const branch=String(c.branch_id??"");if(!branch||!myBranches.has(branch))return false;
   const table=mine.find(t=>String(t.id)===String(d.tableId??"")&&String(t.branch_id)===branch);
   if(table)return true;
   // Legacy call payloads may use table number/name, but never match across branches.
   return mine.some(t=>String(t.branch_id)===branch&&(String(parse(t.data).number??"")===String(d.tableNumber??d.table_number??"")&&Boolean(d.tableNumber??d.table_number)||String(t.name).trim()===String(d.tableName??"").trim()&&Boolean(d.tableName)));}).map(c=>({id:c.id,name:c.name,status:c.status}))});
 }catch(error){console.error("[FOON assigned service]",error);return NextResponse.json({ok:false,code:"ASSIGNED_SERVICE_UNAVAILABLE"},{status:503});}
}
