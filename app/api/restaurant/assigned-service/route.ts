import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import {tenantEntitlement} from "@/lib/plans/entitlements";
import {assertSameOrigin} from "@/lib/security/origin";
import {requireAdditionalBranchUnlock} from "@/lib/restaurant/branch-pin";
import {assignedWaiterTableIds} from "@/lib/restaurant/waiter-assignments";
import {staffCan,type StaffGrant} from "@/lib/restaurant/staff-grants";
export const runtime="nodejs";
const uuid=/^[a-f0-9-]{36}$/i;
const parse=(value:unknown):Record<string,unknown>=>{try{return (typeof value==="string"?JSON.parse(value):value) as Record<string,unknown>??{};}catch{return {};}};
async function scope(user:string,tenant:string,requested:string|null){
 const membership=await requireTenantMembership(user,tenant,["waiter"],false);
 const [assignments]=await database().execute<RowDataPacket[]>("SELECT a.branch_id,a.role FROM employee_branch_assignments a JOIN branches b ON b.id=a.branch_id AND b.tenant_id=a.tenant_id AND b.enabled=TRUE WHERE a.tenant_id=? AND a.user_id=? AND a.enabled=TRUE",[membership.tenantId,user]);
 const branch=requested??(assignments.length===1?String(assignments[0].branch_id):null);
 const matching=assignments.filter(a=>String(a.branch_id)===branch&&a.role===membership.role);
 if(!branch||matching.length!==1)throw Error("FORBIDDEN");
 const [rows]=await database().execute<RowDataPacket[]>("SELECT permission_key,allowed,branch_id FROM employee_permission_grants WHERE tenant_id=? AND user_id=?",[membership.tenantId,user]);
 const grants=rows as StaffGrant[];
 if(!staffCan(grants,branch,"tables"))throw Error("FORBIDDEN");
 await requireAdditionalBranchUnlock(membership.tenantId,branch,user);
 if(!(await tenantEntitlement(membership.tenantId,"tables")).enabled)throw Error("FORBIDDEN");
 return {tenant:membership.tenantId,branch,grants};
}
export async function GET(request:Request){
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const url=new URL(request.url),tenant=url.searchParams.get("tenantId")??"",branch=url.searchParams.get("branch");
 if(!uuid.test(tenant)||(branch!==null&&!uuid.test(branch)))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 let c;try{c=await scope(user,tenant,branch);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 try{
 const db=database(),ids=await assignedWaiterTableIds(db,c.tenant,c.branch,user);
 if(!ids.length)return NextResponse.json({ok:true,tables:[],calls:[],assignmentStatus:"NO_MATCHING_TABLE_ASSIGNMENT"},{headers:{"Cache-Control":"private, no-store"}});
 const [tables]=await db.execute<RowDataPacket[]>("SELECT t.id,t.name,CASE WHEN t.status='inactive' THEN 'out_of_service' WHEN t.status IN ('occupied','reserved') THEN t.status ELSE COALESCE(o.status,t.status) END AS status,t.branch_id FROM restaurant_resources t LEFT JOIN restaurant_floor_table_links l ON l.tenant_id=t.tenant_id AND l.branch_id=t.branch_id AND l.dining_table_id=t.id LEFT JOIN restaurant_floor_plan_layouts f ON f.tenant_id=l.tenant_id AND f.branch_id=l.branch_id AND f.id=l.layout_id AND f.is_active=TRUE LEFT JOIN restaurant_floor_table_operations o ON o.tenant_id=f.tenant_id AND o.branch_id=f.branch_id AND o.layout_id=f.id AND o.floor_table_id=l.floor_table_id WHERE t.tenant_id=? AND t.branch_id=? AND t.kind='dining_table' AND t.archived=FALSE AND t.id IN ("+ids.map(()=>"?").join(",")+")",[c.tenant,c.branch,...ids]);
 let calls:RowDataPacket[]=[];
 if(staffCan(c.grants,c.branch,"waiterCalls")){
  [calls]=await db.execute<RowDataPacket[]>("SELECT id,name,status,data FROM restaurant_resources WHERE tenant_id=? AND branch_id=? AND kind='waiter_call' AND archived=FALSE AND status IN ('pending','in_progress','new','requested','open') AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.tableId')) IN ("+ids.map(()=>"?").join(",")+")",[c.tenant,c.branch,...ids]);
 }
 return NextResponse.json({ok:true,assignmentStatus:"ASSIGNED",tables:tables.map(t=>({id:t.id,name:t.name,status:t.status,branchId:t.branch_id})),calls:calls.map(call=>{const d=parse(call.data);return {id:call.id,name:call.name,status:call.status,note:String(d.note??d.notes??d.message??d.reason??d.customerNote??d.customer_note??"").slice(0,1000)};})},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({ok:false,code:"ASSIGNED_SERVICE_UNAVAILABLE"},{status:503});}
}
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const body=await request.json().catch(()=>null);
 if(!body||!uuid.test(body.tenantId??"")||!uuid.test(body.callId??"")||!uuid.test(body.branch??"")||!["accept","complete"].includes(body.action))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 let c;try{c=await scope(user,body.tenantId,body.branch);if(!staffCan(c.grants,c.branch,"waiterCalls")||!staffCan(c.grants,c.branch,"waiterCalls",body.action==="accept"?"accept":"edit"))throw Error("FORBIDDEN");}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const db=await database().getConnection();
 try{
 await db.beginTransaction();
 const ids=await assignedWaiterTableIds(db,c.tenant,c.branch,user);
 const [calls]=await db.execute<RowDataPacket[]>("SELECT status,data FROM restaurant_resources WHERE tenant_id=? AND branch_id=? AND id=? AND kind='waiter_call' AND archived=FALSE FOR UPDATE",[c.tenant,c.branch,body.callId]);
 const call=calls[0];if(!call||!ids.includes(String(parse(call.data).tableId??""))){await db.rollback();return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const allowed=body.action==="accept"?["pending","new","requested","open"]:["in_progress"];
 if(!allowed.includes(String(call.status))){await db.rollback();return NextResponse.json({ok:false,code:"INVALID_STATE"},{status:409});}
 const next=body.action==="accept"?"in_progress":"completed";
 await db.execute("UPDATE restaurant_resources SET status=?,updated_at=NOW() WHERE tenant_id=? AND branch_id=? AND id=? AND kind='waiter_call' AND archived=FALSE AND status=?",[next,c.tenant,c.branch,body.callId,call.status]);
 await db.commit();return NextResponse.json({ok:true,status:next});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"CALL_UPDATE_FAILED"},{status:503});}finally{db.release();}
}
