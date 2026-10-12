import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import type {RowDataPacket, Pool, PoolConnection} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
import {hashPassword} from "@/lib/auth/password";
export const runtime="nodejs";
async function resolveEmployeeUser(db:Pool | PoolConnection,tenantId:string,data:Record<string,unknown>):Promise<string>{
 const explicit=String(data?.userId??"");
 if(/^[a-f0-9-]{36}$/i.test(explicit)){
  const [members]=await db.execute<RowDataPacket[]>("SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' LIMIT 1",[tenantId,explicit]);
  if(members.length)return explicit;
 }
 const email=String(data?.email??"").trim().toLowerCase();
 if(!email.includes("@")||!email.includes("."))return "";
 const [users]=await db.execute<RowDataPacket[]>("SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id WHERE LOWER(u.email)=? AND m.tenant_id=? AND m.status='active' LIMIT 2",[email,tenantId]);
 return users.length===1?String(users[0].id):"";
}

const modules=["orders","pos","kitchen","menu","categories","tables","sections","reservations","waitlist","waiterCalls","team","attendance","inventory","coupons","marketing","customerInvoices","internalInvoices","printers","reports","storefront","notifications","loyalty","delivery"] as const;
const actions=["view","create","edit","accept","reject","cancel","delete","manage"] as const;
const validPermissions=new Set(modules.flatMap(module=>actions.map(action=>module+"."+action)));
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const actor=await currentUserId();if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const body=await request.json().catch(()=>null);
 const tenantId=String(body?.tenantId??""),resourceId=String(body?.resourceId??""),password=String(body?.password??"");
 const permissions=Array.isArray(body?.permissions)?body.permissions:[];
 if(!/^[a-f0-9-]{36}$/i.test(tenantId)||!/^[a-f0-9-]{36}$/i.test(resourceId)||password.length<9||password.length>128||permissions.length>validPermissions.size||permissions.some((p:unknown)=>typeof p!=="string"||!validPermissions.has(p)))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{await requireTenantMembership(actor,tenantId,["owner","manager"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const passwordHash=await hashPassword(password),db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [rows]=await db.execute<RowDataPacket[]>("SELECT id,name,status,branch_id,data FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='employee' AND archived=FALSE FOR UPDATE",[resourceId,tenantId]);
  if(!rows.length){await db.rollback();return NextResponse.json({ok:false,code:"EMPLOYEE_NOT_FOUND"},{status:404});}
  const employee=rows[0],data=typeof employee.data==="string"?JSON.parse(employee.data):employee.data;
  const email=String(data.email??"").trim().toLowerCase(),role=String(data.role??"");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!["supervisor","cashier","waiter","kitchen","driver","accountant"].includes(role)||data.userId){await db.rollback();return NextResponse.json({ok:false,code:"EMPLOYEE_ACCOUNT_NOT_ELIGIBLE"},{status:409});}
  const [existing]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE email=? LIMIT 1 FOR UPDATE",[email]);
  if(existing.length){await db.rollback();return NextResponse.json({ok:false,code:"ACCOUNT_ALREADY_EXISTS_USE_INVITATION"},{status:409});}
  const userId=randomUUID(),membershipRole=role==="supervisor"?"waiter":role;
  await db.execute("INSERT INTO users(id,email,password_hash,display_name,status) VALUES (?,?,?,?, 'active')",[userId,email,passwordHash,String(employee.name)]);
  await db.execute("INSERT INTO memberships(id,tenant_id,user_id,role,status) VALUES (?,?,?,?, 'active')",[randomUUID(),tenantId,userId,membershipRole]);
  if(employee.branch_id)await db.execute("INSERT INTO employee_branch_assignments(id,tenant_id,user_id,branch_id,role,enabled) VALUES (?,?,?,?,?,TRUE)",[randomUUID(),tenantId,userId,String(employee.branch_id),membershipRole]);
  await db.execute("INSERT INTO employee_permission_grants(id,tenant_id,user_id,branch_id,permission_key,allowed) VALUES (?,?,?,?,?,FALSE)",[randomUUID(),tenantId,userId,employee.branch_id??null,"policy.enabled"]);
  for(const permission of permissions)await db.execute("INSERT INTO employee_permission_grants(id,tenant_id,user_id,branch_id,permission_key,allowed) VALUES (?,?,?,?,?,TRUE)",[randomUUID(),tenantId,userId,employee.branch_id??null,permission]);
  data.userId=userId;data.invitationStatus="accepted";
  await db.execute("UPDATE restaurant_resources SET data=?,version=version+1 WHERE id=? AND tenant_id=?",[JSON.stringify(data),resourceId,tenantId]);
  await db.commit();
  return NextResponse.json({ok:true});
 }catch(error){await db.rollback();console.error("[FOON staff provisioning]",error);return NextResponse.json({ok:false,code:"EMPLOYEE_PROVISION_FAILED"},{status:503});}finally{db.release();}
}

export async function PATCH(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const actor=await currentUserId();if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const body=await request.json().catch(()=>null);
 const tenantId=String(body?.tenantId??""),resourceId=String(body?.resourceId??"");
 const permissions=body?.permissions;
 if(!/^[a-f0-9-]{36}$/i.test(tenantId)||!/^[a-f0-9-]{36}$/i.test(resourceId)||!Array.isArray(permissions)||permissions.length>validPermissions.size||permissions.some((p:unknown)=>typeof p!=="string"||!validPermissions.has(p))||new Set(permissions).size!==permissions.length)return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{await requireTenantMembership(actor,tenantId,["owner","manager"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [rows]=await db.execute<RowDataPacket[]>("SELECT branch_id,data FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='employee' AND archived=FALSE FOR UPDATE",[resourceId,tenantId]);
  if(!rows.length){await db.rollback();return NextResponse.json({ok:false,code:"EMPLOYEE_NOT_FOUND"},{status:404});}
  const employee=rows[0],data=typeof employee.data==="string"?JSON.parse(employee.data):employee.data;
  const userId=await resolveEmployeeUser(db,tenantId,data);
  if(!/^[a-f0-9-]{36}$/i.test(userId)){await db.rollback();return NextResponse.json({ok:false,code:"EMPLOYEE_ACCOUNT_NOT_LINKED"},{status:409});}
  const [memberships]=await db.execute<RowDataPacket[]>("SELECT role FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' LIMIT 1",[tenantId,userId]);
  if(!memberships.length||["owner","manager"].includes(String(memberships[0].role))){await db.rollback();return NextResponse.json({ok:false,code:"EMPLOYEE_PERMISSION_CHANGE_FORBIDDEN"},{status:403});}
  const branchId=employee.branch_id??null;
  await db.execute("DELETE FROM employee_permission_grants WHERE tenant_id=? AND user_id=? AND branch_id <=> ?",[tenantId,userId,branchId]);
  await db.execute("INSERT INTO employee_permission_grants(id,tenant_id,user_id,branch_id,permission_key,allowed) VALUES (?,?,?,?,?,FALSE)",[randomUUID(),tenantId,userId,branchId,"policy.enabled"]);
  for(const permission of permissions)await db.execute("INSERT INTO employee_permission_grants(id,tenant_id,user_id,branch_id,permission_key,allowed) VALUES (?,?,?,?,?,TRUE)",[randomUUID(),tenantId,userId,branchId,permission]);
  await db.commit();return NextResponse.json({ok:true});
 }catch(error){await db.rollback();console.error("[FOON staff permission update]",error);return NextResponse.json({ok:false,code:"EMPLOYEE_PERMISSION_UPDATE_FAILED"},{status:503});}finally{db.release();}
}
export async function GET(request:Request){
 const actor=await currentUserId();if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const url=new URL(request.url),tenantId=url.searchParams.get("tenantId")??"",resourceId=url.searchParams.get("resourceId")??"";
 if(!/^[a-f0-9-]{36}$/i.test(tenantId)||!/^[a-f0-9-]{36}$/i.test(resourceId))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{await requireTenantMembership(actor,tenantId,["owner","manager"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const [rows]=await database().execute<RowDataPacket[]>("SELECT branch_id,data FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='employee' AND archived=FALSE LIMIT 1",[resourceId,tenantId]);
 if(!rows.length)return NextResponse.json({ok:false,code:"EMPLOYEE_NOT_FOUND"},{status:404});
 const data=typeof rows[0].data==="string"?JSON.parse(rows[0].data):rows[0].data,userId=await resolveEmployeeUser(database(),tenantId,data);
 if(!/^[a-f0-9-]{36}$/i.test(userId))return NextResponse.json({ok:true,linked:false,permissions:[]});
 const [grants]=await database().execute<RowDataPacket[]>("SELECT permission_key FROM employee_permission_grants WHERE tenant_id=? AND user_id=? AND (branch_id IS NULL OR branch_id <=> ?) AND allowed=TRUE",[tenantId,userId,rows[0].branch_id??null]);
 return NextResponse.json({ok:true,linked:true,permissions:grants.map(row=>String(row.permission_key)).filter(key=>validPermissions.has(key))});
}
