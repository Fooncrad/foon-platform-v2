import { NextResponse } from "next/server";
import { dispatchNotifications } from "@/lib/notifications/dispatch";
import { queueLoginAlert } from "@/lib/auth/login-alert";
import type { RowDataPacket } from "mysql2/promise";
import { database } from "@/lib/db/mysql";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { accountMembershipRestriction } from "@/lib/auth/account-login-policy";
import { clientIp, loginAllowed, recordLogin } from "@/lib/auth/rate-limit";
import { assertSameOrigin } from "@/lib/security/origin";
import {randomUUID} from "node:crypto";
import {logIncident} from "@/lib/platform/incidents";

export const runtime="nodejs";
export async function POST(request:Request){
 const ip=clientIp(request); let email=""; let stage="origin";
 try{
  try { assertSameOrigin(request); }
  catch { return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403}); }
  stage="request";
  const body=await request.json(); email=String(body.email??"").trim().toLowerCase(); const password=String(body.password??"");
  stage="rate_limit";
  if(!(await loginAllowed(email,ip))) return NextResponse.json({ok:false,code:"TOO_MANY_ATTEMPTS"},{status:429});
  stage="user_lookup";
  const [rows]=await database().execute<RowDataPacket[]>("SELECT id,password_hash,status,email_verified_at FROM users WHERE email=? LIMIT 1",[email]);
  stage="password_verify";
  const user=rows[0]; const valid=!!user?.password_hash && await verifyPassword(password,String(user.password_hash));
  stage="record_attempt";
  await recordLogin(email,ip,valid&&user.status==="active");
  if(!valid)return NextResponse.json({ok:false,code:"INVALID_CREDENTIALS"},{status:401});
  if(user.status!=="active")return NextResponse.json({ok:false,code:user.status==="suspended"?"ACCOUNT_SUSPENDED":user.status==="pending"?"ACCOUNT_PENDING":"ACCOUNT_DISABLED"},{status:403,headers:{"Cache-Control":"no-store"}});
  stage="membership_policy";
  const restriction=await accountMembershipRestriction(database(),String(user.id));
  if(restriction)return NextResponse.json({ok:false,code:restriction},{status:403,headers:{"Cache-Control":"no-store"}});
  stage="session_create";
  await createSession(String(user.id));
  stage="login_alert";
  if(await queueLoginAlert(database(),String(user.id),request,"password"))dispatchNotifications();
  return NextResponse.json({ok:true,emailVerificationRequired:!user.email_verified_at});
 }catch(error){
  const incidentId=randomUUID().slice(0,8).toUpperCase();
  logIncident({incidentId,code:"LOGIN_UNAVAILABLE",location:"auth.login."+stage,error});
  return NextResponse.json({ok:false,code:"LOGIN_UNAVAILABLE",incidentId},{status:503,headers:{"Cache-Control":"no-store","X-Foon-Incident-Id":incidentId}});
 }
}
