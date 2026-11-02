import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import type {RowDataPacket,ResultSetHeader} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
import {database} from "@/lib/db/mysql";
import {hashPassword} from "@/lib/auth/password";
import {requireAdditionalBranchUnlock,BranchPinError} from "@/lib/restaurant/branch-pin";
import {normalizeEmployeePermissions,parseEmployeeProvisionPatch,validPermissions} from "@/lib/restaurant/employee-permissions";
import {resolveBoundEmployeeUser} from "@/lib/restaurant/employee-link-scope";
export const runtime="nodejs";
// A staff payload can contain the full permission set, but never needs an
// unbounded body. Check actual streamed bytes, not only Content-Length.
const MAX_EMPLOYEE_BODY_BYTES=16*1024;
async function employeePayload(request:Request):Promise<{body:Record<string,unknown>|null;error:Response|null}>{
 try{
  const parsed=await readLimitedJson(request,MAX_EMPLOYEE_BODY_BYTES);
  return {body:parsed!==null&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as Record<string,unknown>:null,error:null};
 }catch(error){
  const oversized=error instanceof Error&&error.message==="BATCH_TOO_LARGE";
  return {body:null,error:NextResponse.json({ok:false,code:oversized?"BODY_TOO_LARGE":"INVALID_INPUT"},{status:oversized?413:400})};
 }
}
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const actor=await currentUserId();if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const parsed=await employeePayload(request);if(parsed.error)return parsed.error;
 const body=parsed.body;
 const tenantId=String(body?.tenantId??""),resourceId=String(body?.resourceId??""),password=String(body?.password??"");
 const permissions=normalizeEmployeePermissions(body?.permissions===undefined?[]:body?.permissions);
 if(!/^[a-f0-9-]{36}$/i.test(tenantId)||!/^[a-f0-9-]{36}$/i.test(resourceId)||password.length<9||password.length>128||permissions===null)return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{await requireTenantMembership(actor,tenantId,["owner","manager"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const passwordHash=await hashPassword(password),db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [rows]=await db.execute<RowDataPacket[]>("SELECT id,name,status,branch_id,data FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='employee' AND archived=FALSE FOR UPDATE",[resourceId,tenantId]);
  if(!rows.length){await db.rollback();return NextResponse.json({ok:false,code:"EMPLOYEE_NOT_FOUND"},{status:404});}
  const employee=rows[0],data=typeof employee.data==="string"?JSON.parse(employee.data):employee.data;
  try{await requireAdditionalBranchUnlock(tenantId,employee.branch_id?String(employee.branch_id):null,actor);}catch(error){await db.rollback();return NextResponse.json({ok:false,code:error instanceof BranchPinError?error.code:"FORBIDDEN"},{status:403});}
  const email=String(data.email??"").trim().toLowerCase(),role=String(data.role??"");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!["supervisor","cashier","waiter","kitchen","driver","accountant"].includes(role)){await db.rollback();return NextResponse.json({ok:false,code:"EMPLOYEE_ACCOUNT_NOT_ELIGIBLE"},{status:409});}
  if(!employee.branch_id){await db.rollback();return NextResponse.json({ok:false,code:"BRANCH_REQUIRED"},{status:400});}
  const branchId=String(employee.branch_id);
  const [validBranch]=await db.execute<RowDataPacket[]>("SELECT id FROM branches WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[branchId,tenantId]);
  if(!validBranch.length){await db.rollback();return NextResponse.json({ok:false,code:"BRANCH_NOT_FOUND"},{status:400});}
  const membershipRole=role==="supervisor"?"waiter":role;
  const [existing]=await db.execute<RowDataPacket[]>("SELECT id,email,status FROM users WHERE email=? LIMIT 1 FOR UPDATE",[email]);
  let userId="";
  if(existing.length){
   const candidateId=String(existing[0].id??"");
   const eligible=String(existing[0].status)==="active"&&await resolveBoundEmployeeUser(db,tenantId,branchId,{userId:candidateId,role})===candidateId;
   if(!eligible||String(existing[0].email??"").trim().toLowerCase()!==email||(data.userId&&String(data.userId)!==candidateId)){await db.rollback();return NextResponse.json({ok:false,code:"EMPLOYEE_ACCOUNT_NOT_ELIGIBLE"},{status:409});}
   userId=candidateId;
   await db.execute("UPDATE users SET password_hash=?,display_name=? WHERE id=? AND status='active'",[passwordHash,String(employee.name),userId]);
   await db.execute("DELETE FROM auth_sessions WHERE user_id=?",[userId]);
   await db.execute("DELETE FROM employee_permission_grants WHERE tenant_id=? AND user_id=? AND branch_id <=> ?",[tenantId,userId,branchId]);
  }else{
   if(data.userId){await db.rollback();return NextResponse.json({ok:false,code:"EMPLOYEE_ACCOUNT_NOT_ELIGIBLE"},{status:409});}
   userId=randomUUID();
   await db.execute("INSERT INTO users(id,email,password_hash,display_name,status) VALUES (?,?,?,?, 'active')",[userId,email,passwordHash,String(employee.name)]);
   await db.execute("INSERT INTO memberships(id,tenant_id,user_id,role,status) VALUES (?,?,?,?, 'active')",[randomUUID(),tenantId,userId,membershipRole]);
   await db.execute("INSERT INTO employee_branch_assignments(id,tenant_id,user_id,branch_id,role,enabled) VALUES (?,?,?,?,?,TRUE)",[randomUUID(),tenantId,userId,branchId,membershipRole]);
  }
  await db.execute("INSERT INTO employee_permission_grants(id,tenant_id,user_id,branch_id,permission_key,allowed) VALUES (?,?,?,?,?,FALSE)",[randomUUID(),tenantId,userId,branchId,"policy.enabled"]);
  for(const permission of permissions)await db.execute("INSERT INTO employee_permission_grants(id,tenant_id,user_id,branch_id,permission_key,allowed) VALUES (?,?,?,?,?,TRUE)",[randomUUID(),tenantId,userId,branchId,permission]);
  data.userId=userId;data.invitationStatus="accepted";
  await db.execute("UPDATE restaurant_resources SET data=?,status='active',version=version+1 WHERE id=? AND tenant_id=?",[JSON.stringify(data),resourceId,tenantId]);
  await db.commit();
  return NextResponse.json({ok:true});
 }catch(error){await db.rollback();console.error("[FOON staff provisioning]",error);return NextResponse.json({ok:false,code:"EMPLOYEE_PROVISION_FAILED"},{status:503});}finally{db.release();}
}

export async function PATCH(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const actor=await currentUserId();if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const parsed=await employeePayload(request);if(parsed.error)return parsed.error;
 const body=parsed.body;
 const tenantId=String(body?.tenantId??""),resourceId=String(body?.resourceId??"");
 const change=parseEmployeeProvisionPatch(body);
 if(!/^[a-f0-9-]{36}$/i.test(tenantId)||!/^[a-f0-9-]{36}$/i.test(resourceId)||change===null)return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{await requireTenantMembership(actor,tenantId,["owner","manager"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [rows]=await db.execute<RowDataPacket[]>("SELECT branch_id,data FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='employee' AND archived=FALSE FOR UPDATE",[resourceId,tenantId]);
  if(!rows.length){await db.rollback();return NextResponse.json({ok:false,code:"EMPLOYEE_NOT_FOUND"},{status:404});}
  const employee=rows[0],data=typeof employee.data==="string"?JSON.parse(employee.data):employee.data;
  try{await requireAdditionalBranchUnlock(tenantId,employee.branch_id?String(employee.branch_id):null,actor);}catch(error){await db.rollback();return NextResponse.json({ok:false,code:error instanceof BranchPinError?error.code:"FORBIDDEN"},{status:403});}
  let userId=await resolveBoundEmployeeUser(db,tenantId,employee.branch_id??null,data);
  if(!/^[a-f0-9-]{36}$/i.test(userId)){
   // Existing employee accounts can predate the resource link. Reuse one only
   // when email, active tenant membership, role, and enabled branch assignment all match.
   const email=String(data.email??"").trim().toLowerCase(),role=String(data.role??"");
   const membershipRole=role==="supervisor"?"waiter":role;
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!["waiter","cashier","kitchen","driver","accountant"].includes(membershipRole)||typeof employee.branch_id!=="string"){
    await db.rollback();return NextResponse.json({ok:false,code:"EMPLOYEE_ACCOUNT_NOT_LINKED"},{status:409});
   }
   const [candidates]=await db.execute<RowDataPacket[]>(`SELECT u.id FROM users u
    JOIN memberships m ON m.user_id COLLATE utf8mb4_unicode_ci=u.id COLLATE utf8mb4_unicode_ci AND m.tenant_id=? AND m.status='active' AND m.role=?
    JOIN employee_branch_assignments a ON a.tenant_id COLLATE utf8mb4_unicode_ci=m.tenant_id COLLATE utf8mb4_unicode_ci AND a.user_id COLLATE utf8mb4_unicode_ci=u.id COLLATE utf8mb4_unicode_ci AND a.branch_id=? AND a.enabled=TRUE AND a.role COLLATE utf8mb4_unicode_ci=m.role COLLATE utf8mb4_unicode_ci
    WHERE LOWER(u.email)=? AND u.status='active'
     AND NOT EXISTS(SELECT 1 FROM memberships cm WHERE cm.user_id COLLATE utf8mb4_unicode_ci=u.id COLLATE utf8mb4_unicode_ci AND cm.role='customer' AND cm.status='active')
     AND NOT EXISTS(SELECT 1 FROM tenant_customers tc WHERE tc.user_id COLLATE utf8mb4_unicode_ci=u.id COLLATE utf8mb4_unicode_ci)
     AND NOT EXISTS(SELECT 1 FROM platform_admins pa WHERE pa.user_id COLLATE utf8mb4_unicode_ci=u.id COLLATE utf8mb4_unicode_ci)
    LIMIT 2 FOR UPDATE`,[tenantId,membershipRole,String(employee.branch_id),email]);
   if(candidates.length!==1){await db.rollback();return NextResponse.json({ok:false,code:candidates.length>1?"EMPLOYEE_ACCOUNT_AMBIGUOUS":"EMPLOYEE_ACCOUNT_NOT_ELIGIBLE"},{status:409});}
   userId=String(candidates[0].id);
   data.userId=userId;
   await db.execute("UPDATE restaurant_resources SET data=?,version=version+1 WHERE id=? AND tenant_id=?",[JSON.stringify(data),resourceId,tenantId]);
  }
  const [memberships]=await db.execute<RowDataPacket[]>("SELECT role FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' LIMIT 1",[tenantId,userId]);
  if(!memberships.length||["owner","manager"].includes(String(memberships[0].role))){await db.rollback();return NextResponse.json({ok:false,code:"EMPLOYEE_PERMISSION_CHANGE_FORBIDDEN"},{status:403});}
  const branchId=employee.branch_id??null;
  // Password-only resets must not overwrite the employee's existing grants.
  if(change.permissions!==undefined){
   await db.execute("DELETE FROM employee_permission_grants WHERE tenant_id=? AND user_id=? AND branch_id <=> ?",[tenantId,userId,branchId]);
   await db.execute("INSERT INTO employee_permission_grants(id,tenant_id,user_id,branch_id,permission_key,allowed) VALUES (?,?,?,?,?,FALSE)",[randomUUID(),tenantId,userId,branchId,"policy.enabled"]);
   for(const permission of change.permissions)await db.execute("INSERT INTO employee_permission_grants(id,tenant_id,user_id,branch_id,permission_key,allowed) VALUES (?,?,?,?,?,TRUE)",[randomUUID(),tenantId,userId,branchId,permission]);
  }
  if(change.password!==undefined){
   const nextHash=await hashPassword(change.password);
   const [updated]=await db.execute<ResultSetHeader>("UPDATE users SET password_hash=? WHERE id=? AND status='active'",[nextHash,userId]);
   if(updated.affectedRows!==1){await db.rollback();return NextResponse.json({ok:false,code:"EMPLOYEE_ACCOUNT_INACTIVE"},{status:409});}
   // Password reset must revoke every previously authenticated employee device.
   await db.execute("DELETE FROM auth_sessions WHERE user_id=?",[userId]);
   await db.execute("INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id,metadata) VALUES (?, ?, 'employee.password_reset', ?, ?)",[tenantId,actor,resourceId,JSON.stringify({employeeUserId:userId})]);
  }
  await db.commit();return NextResponse.json({ok:true});
 }catch(error){await db.rollback();console.error("[FOON staff permission update]",error);return NextResponse.json({ok:false,code:"EMPLOYEE_PERMISSION_UPDATE_FAILED"},{status:503});}finally{db.release();}
}
export async function GET(request:Request){
 const actor=await currentUserId();if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const url=new URL(request.url),tenantId=url.searchParams.get("tenantId")??"",resourceId=url.searchParams.get("resourceId")??"";
 if(!/^[a-f0-9-]{36}$/i.test(tenantId)||!/^[a-f0-9-]{36}$/i.test(resourceId))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{await requireTenantMembership(actor,tenantId,["owner","manager"],false);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const [rows]=await database().execute<RowDataPacket[]>("SELECT branch_id,data FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='employee' AND archived=FALSE LIMIT 1",[resourceId,tenantId]);
 if(!rows.length)return NextResponse.json({ok:false,code:"EMPLOYEE_NOT_FOUND"},{status:404});
 try{await requireAdditionalBranchUnlock(tenantId,rows[0].branch_id?String(rows[0].branch_id):null,actor);}catch(error){return NextResponse.json({ok:false,code:error instanceof BranchPinError?error.code:"FORBIDDEN"},{status:403});}
 try{
  const db=database(),employee=rows[0],rawData=typeof employee.data==="string"?JSON.parse(employee.data):employee.data;
  const data=rawData&&typeof rawData==="object"?rawData as Record<string,unknown>:{};
  let userId=await resolveBoundEmployeeUser(db,tenantId,employee.branch_id??null,data);
  if(!/^[a-f0-9-]{36}$/i.test(userId)){
   // Recover one eligible legacy account when the resource predates its userId link.
   const email=String(data.email??"").trim().toLowerCase(),role=String(data.role??"");
   const membershipRole=role==="supervisor"?"waiter":role;
   if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&["waiter","cashier","kitchen","driver","accountant"].includes(membershipRole)&&typeof employee.branch_id==="string"){
    const [candidates]=await db.execute<RowDataPacket[]>(`SELECT u.id FROM users u
     JOIN memberships m ON m.user_id COLLATE utf8mb4_unicode_ci=u.id COLLATE utf8mb4_unicode_ci AND m.tenant_id=? AND m.status='active' AND m.role=?
     JOIN employee_branch_assignments a ON a.tenant_id COLLATE utf8mb4_unicode_ci=m.tenant_id COLLATE utf8mb4_unicode_ci AND a.user_id COLLATE utf8mb4_unicode_ci=u.id COLLATE utf8mb4_unicode_ci AND a.branch_id=? AND a.enabled=TRUE AND a.role COLLATE utf8mb4_unicode_ci=m.role COLLATE utf8mb4_unicode_ci
     WHERE LOWER(u.email)=? AND u.status='active'
      AND NOT EXISTS(SELECT 1 FROM memberships cm WHERE cm.user_id COLLATE utf8mb4_unicode_ci=u.id COLLATE utf8mb4_unicode_ci AND cm.role='customer' AND cm.status='active')
      AND NOT EXISTS(SELECT 1 FROM tenant_customers tc WHERE tc.user_id COLLATE utf8mb4_unicode_ci=u.id COLLATE utf8mb4_unicode_ci)
      AND NOT EXISTS(SELECT 1 FROM platform_admins pa WHERE pa.user_id COLLATE utf8mb4_unicode_ci=u.id COLLATE utf8mb4_unicode_ci)
     LIMIT 2`,[tenantId,membershipRole,String(employee.branch_id),email]);
    if(candidates.length===1)userId=String(candidates[0].id);
   }
  }
  if(!/^[a-f0-9-]{36}$/i.test(userId))return NextResponse.json({ok:true,linked:false,permissions:[]});
  const [grants]=await db.execute<RowDataPacket[]>("SELECT permission_key FROM employee_permission_grants WHERE tenant_id=? AND user_id=? AND (branch_id IS NULL OR branch_id <=> ?) AND allowed=TRUE",[tenantId,userId,employee.branch_id??null]);
  return NextResponse.json({ok:true,linked:true,permissions:grants.map(row=>String(row.permission_key)).filter(key=>validPermissions.has(key))});
 }catch(error){console.error("[FOON staff permission read]",error);return NextResponse.json({ok:false,code:"EMPLOYEE_PERMISSION_READ_FAILED"},{status:503});}
}
