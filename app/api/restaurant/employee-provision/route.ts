import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
import {hashPassword} from "@/lib/auth/password";
export const runtime="nodejs";
const actions=["view","create","edit","accept","reject","cancel"] as const;
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const actor=await currentUserId();if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const body=await request.json().catch(()=>null);
 const tenantId=String(body?.tenantId??""),resourceId=String(body?.resourceId??""),password=String(body?.password??"");
 const permissions=Array.isArray(body?.permissions)?body.permissions:[];
 if(!/^[a-f0-9-]{36}$/i.test(tenantId)||!/^[a-f0-9-]{36}$/i.test(resourceId)||password.length<9||password.length>128||permissions.some((p:unknown)=>!actions.includes(p as typeof actions[number])))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
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
  for(const action of actions)await db.execute("INSERT INTO employee_permission_grants(id,tenant_id,user_id,branch_id,permission_key,allowed) VALUES (?,?,?,?,?,?)",[randomUUID(),tenantId,userId,employee.branch_id??null,"orders."+action,permissions.includes(action)?1:0]);
  data.userId=userId;data.invitationStatus="accepted";
  await db.execute("UPDATE restaurant_resources SET data=?,version=version+1 WHERE id=? AND tenant_id=?",[JSON.stringify(data),resourceId,tenantId]);
  await db.commit();
  return NextResponse.json({ok:true});
 }catch(error){await db.rollback();console.error("[FOON staff provisioning]",error);return NextResponse.json({ok:false,code:"EMPLOYEE_PROVISION_FAILED"},{status:503});}finally{db.release();}
}
