import {NextResponse} from "next/server";
import {createHash,randomUUID} from "node:crypto";
import {hashPassword} from "@/lib/auth/password";
import {createSession} from "@/lib/auth/session";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
export const runtime="nodejs";
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const user=await currentUserId();

 const body=await request.json().catch(()=>null),token=typeof body?.token==="string"?body.token:"";
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))return NextResponse.json({ok:false,code:"INVALID_TOKEN"},{status:400});
 const password=typeof body?.password==="string"?body.password:"";
 if(!user&&(password.length<9||password.length>128))return NextResponse.json({ok:false,code:"PASSWORD_REQUIRED"},{status:400});
 const passwordHash=!user?await hashPassword(password):null;
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const hash=createHash("sha256").update(token).digest("hex");
  const [invites]=await db.execute<RowDataPacket[]>("SELECT id,tenant_id,resource_id,email FROM employee_invites WHERE token_hash=? AND used_at IS NULL AND expires_at>NOW() LIMIT 1 FOR UPDATE",[hash]);
  if(!invites.length){await db.rollback();return NextResponse.json({ok:false,code:"INVITATION_EXPIRED"},{status:410});}
  const invite=invites[0];
  let employeeUserId=user;
  if(user){
   const [users]=await db.execute<RowDataPacket[]>("SELECT email,status FROM users WHERE id=? LIMIT 1",[user]);
   if(!users.length||users[0].status!=="active"||String(users[0].email).toLowerCase()!==String(invite.email).toLowerCase()){await db.rollback();return NextResponse.json({ok:false,code:"INVITATION_EMAIL_MISMATCH"},{status:403});}
  }else{
   const [existingUsers]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE email=? LIMIT 1",[invite.email]);
   if(existingUsers.length){await db.rollback();return NextResponse.json({ok:false,code:"LOGIN_REQUIRED"},{status:401});}
   employeeUserId=randomUUID();
   await db.execute("INSERT INTO users(id,email,password_hash,display_name,status) VALUES (?,?,?,?, 'active')",[employeeUserId,invite.email,passwordHash,"موظف"]);
  }
  const [resources]=await db.execute<RowDataPacket[]>("SELECT id,status,data,branch_id FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='employee' AND archived=FALSE LIMIT 1 FOR UPDATE",[invite.resource_id,invite.tenant_id]);
  if(!resources.length){await db.rollback();return NextResponse.json({ok:false,code:"RESOURCE_NOT_FOUND"},{status:404});}
  const data=typeof resources[0].data==="string"?JSON.parse(resources[0].data):resources[0].data;
  if(String(data.email).toLowerCase()!==String(invite.email).toLowerCase()||data.userId){await db.rollback();return NextResponse.json({ok:false,code:"INVITATION_INVALID"},{status:409});}
  const [existing]=await db.execute<RowDataPacket[]>("SELECT role FROM memberships WHERE tenant_id=? AND user_id=? FOR UPDATE",[invite.tenant_id,employeeUserId]);
  if(existing.some(x=>x.role==="owner"||x.role==="manager")){await db.rollback();return NextResponse.json({ok:false,code:"PROTECTED_MEMBERSHIP"},{status:403});}
  const role=String(data.role)==="supervisor"?"waiter":String(data.role);
  if(!["manager","cashier","waiter","kitchen","driver","accountant"].includes(role)){await db.rollback();return NextResponse.json({ok:false,code:"INVALID_ROLE"},{status:400});}
  await db.execute("INSERT INTO memberships(id,tenant_id,user_id,role,status) VALUES (?,?,?,?, 'active') ON DUPLICATE KEY UPDATE role=VALUES(role),status='active'",[randomUUID(),invite.tenant_id,employeeUserId,role]);
  // A branch-specific employee invitation grants access only to its own tenant and branch.
  // Tenant-wide employees remain unassigned until the manager selects branches.
  const employeeBranch=resources[0].branch_id?String(resources[0].branch_id):null;
  if(employeeBranch){
   const [validBranch]=await db.execute<RowDataPacket[]>("SELECT id FROM branches WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[employeeBranch,invite.tenant_id]);
   if(!validBranch.length){await db.rollback();return NextResponse.json({ok:false,code:"BRANCH_NOT_FOUND"},{status:400});}
   await db.execute("INSERT INTO employee_branch_assignments(id,tenant_id,user_id,branch_id,role,enabled) VALUES (?,?,?,?,?,TRUE) ON DUPLICATE KEY UPDATE enabled=TRUE",[randomUUID(),invite.tenant_id,employeeUserId,employeeBranch,role]);
  }
  data.userId=employeeUserId;data.invitationStatus="accepted";
  await db.execute("UPDATE restaurant_resources SET data=?,status='active',version=version+1 WHERE id=? AND tenant_id=?",[JSON.stringify(data),invite.resource_id,invite.tenant_id]);
  await db.execute("UPDATE employee_invites SET used_at=NOW() WHERE id=?",[invite.id]);
  if(!user)await createSession(String(employeeUserId),db);
  await db.commit();
  return NextResponse.json({ok:true,tenantId:invite.tenant_id});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"INVITATION_UNAVAILABLE"},{status:503});}finally{db.release();}
}
