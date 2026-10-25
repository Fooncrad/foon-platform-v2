import {NextResponse} from "next/server";
import type {ResultSetHeader,RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentSessionId,currentUserId} from "@/lib/auth/session";
import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {assertSameOrigin} from "@/lib/security/origin";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const fail=(code:string,status:number)=>NextResponse.json({ok:false,code},{status,headers});
const validId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function access():Promise<{error:NextResponse;userId?:never;sessionId?:never}|{error?:never;userId:string;sessionId:string}>{
 const denied=await employeePersonalAccessDenied();if(denied)return {error:denied};
 const userId=await currentUserId(),sessionId=await currentSessionId();
 if(!userId||!sessionId)return {error:fail("UNAUTHENTICATED",401)};
 // A valid session token must not restore access after an account is frozen.
 // Match the active-user gate used by the customer dashboard and favorites API.
 try{
  const [users]=await database().execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status='active' LIMIT 1",[userId]);
  if(!users.length)return {error:fail("UNAUTHENTICATED",401)};
 }catch{return {error:fail("SESSIONS_UNAVAILABLE",503)};}
 return {userId,sessionId};
}
export async function GET(){
 const ctx=await access();if(ctx.error)return ctx.error;
 try{
  const [rows]=await database().execute<RowDataPacket[]>("SELECT id,created_at,last_seen_at,expires_at FROM auth_sessions WHERE user_id=? AND expires_at>UTC_TIMESTAMP() ORDER BY created_at DESC LIMIT 60",[ctx.userId]);
  return NextResponse.json({ok:true,sessions:rows.map(row=>({id:String(row.id),current:String(row.id)===ctx.sessionId,createdAt:row.created_at,lastSeenAt:row.last_seen_at,expiresAt:row.expires_at})),limited:rows.length===60},{headers});
 }catch{return fail("SESSIONS_UNAVAILABLE",503);}
}
export async function DELETE(request:Request){
 try{assertSameOrigin(request);}catch{return fail("FORBIDDEN",403);}
 const ctx=await access();if(ctx.error)return ctx.error;
 const body=await request.json().catch(()=>null);
 const allOthers=body?.allOthers===true&&body?.id===undefined;
 const id=!allOthers&&typeof body?.id==="string"?body.id:"";
 if(!allOthers&&!validId.test(id))return fail("INVALID_INPUT",400);
 if(id===ctx.sessionId)return fail("CURRENT_SESSION_PROTECTED",409);
 try{
  let result:ResultSetHeader;
  if(allOthers)[result]=await database().execute<ResultSetHeader>("DELETE FROM auth_sessions WHERE user_id=? AND id<>? AND expires_at>UTC_TIMESTAMP()",[ctx.userId,ctx.sessionId]);
  else [result]=await database().execute<ResultSetHeader>("DELETE FROM auth_sessions WHERE user_id=? AND id=? AND id<>?",[ctx.userId,id,ctx.sessionId]);
  if(!allOthers&&!result.affectedRows)return fail("SESSION_NOT_FOUND",404);
  return NextResponse.json({ok:true,revoked:result.affectedRows},{headers});
 }catch{return fail("SESSION_REVOKE_FAILED",503);}
}
