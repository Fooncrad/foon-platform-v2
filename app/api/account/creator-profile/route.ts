import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {ResultSetHeader,RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {customerCreatorUserId} from "@/lib/creator/authorization";
import {parseCreatorDraft,parsePortfolioDraft,CREATOR_PORTFOLIO_LIMIT} from "@/lib/creator/profile-policy";
import {assertSameOrigin} from "@/lib/security/origin";
import {readCreatorMutationJson} from "@/lib/creator/request-body";
import {database} from "@/lib/db/mysql";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const fail=(code:string,status:number)=>NextResponse.json({ok:false,code},{status,headers});
async function scope(){
 const user=await currentUserId();
 if(!user)return {error:fail("UNAUTHENTICATED",401)};
 const employeeDenied=await employeePersonalAccessDenied();
 if(employeeDenied)return {error:employeeDenied};
 const customer=await customerCreatorUserId();
 if(!customer)return {error:fail("CUSTOMER_ACCOUNT_REQUIRED",403)};
 return {userId:customer};
}
export async function GET(){
 const access=await scope();if(access.error)return access.error;
 try{
  const [profiles]=await database().execute<RowDataPacket[]>(
   "SELECT handle,display_name,bio,visibility FROM customer_creator_profiles WHERE user_id=? LIMIT 1",[access.userId]);
  const [portfolio]=await database().execute<RowDataPacket[]>(
   "SELECT p.id,p.media_id,p.caption,m.file_name FROM customer_creator_portfolio p "+
   "JOIN user_media_library m ON m.id=p.media_id AND m.user_id=p.user_id "+
   "WHERE p.user_id=? ORDER BY p.created_at DESC,p.id DESC LIMIT 24",[access.userId]);
  return NextResponse.json({ok:true,profile:profiles[0]??null,portfolio},{headers});
 }catch{return fail("CREATOR_PROFILE_UNAVAILABLE",503);}
}
export async function PUT(request:Request){
 try{assertSameOrigin(request);}catch{return fail("FORBIDDEN",403);}
 const access=await scope();if(access.error)return access.error;
 const parsed=await readCreatorMutationJson(request,8192);
 if(parsed.error)return fail(parsed.error.code,parsed.error.status);
 const input=parseCreatorDraft(parsed.body);
 if(!input)return fail("INVALID_INPUT",400);
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [users]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE",[access.userId]);
  if(!users.length){await db.rollback();return fail("UNAUTHENTICATED",401);}
  const [disqualified]=await db.execute<RowDataPacket[]>(
   "SELECT 1 FROM memberships WHERE user_id=? UNION ALL SELECT 1 FROM platform_admins WHERE user_id=? LIMIT 1",
   [access.userId,access.userId]);
  if(disqualified.length){await db.rollback();return fail("CUSTOMER_ACCOUNT_REQUIRED",403);}
  const [existing]=await db.execute<RowDataPacket[]>(
   "SELECT user_id FROM customer_creator_profiles WHERE user_id=? FOR UPDATE",[access.userId]);
  if(existing.length)await db.execute(
   "UPDATE customer_creator_profiles SET handle=?,display_name=?,bio=?,visibility=? WHERE user_id=?",
   [input.handle,input.displayName,input.bio,input.visibility,access.userId]);
  else await db.execute(
   "INSERT INTO customer_creator_profiles(user_id,handle,display_name,bio,visibility) VALUES (?,?,?,?,?)",
   [access.userId,input.handle,input.displayName,input.bio,input.visibility]);
  await db.commit();return NextResponse.json({ok:true,profile:input,publicUrl:input.visibility==="public"?"/creators/"+input.handle:null},{headers});
 }catch(error){
  await db.rollback();
  if((error as {code?:string})?.code==="ER_DUP_ENTRY")return fail("HANDLE_TAKEN",409);
  return fail("CREATOR_PROFILE_SAVE_FAILED",503);
 }finally{db.release();}
}
/** Add only the account owner's explicit personal-library image to the creator portfolio. */
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return fail("FORBIDDEN",403);}
 const access=await scope();if(access.error)return access.error;
 const parsed=await readCreatorMutationJson(request,2048);
 if(parsed.error)return fail(parsed.error.code,parsed.error.status);
 const input=parsePortfolioDraft(parsed.body);
 if(!input)return fail("INVALID_INPUT",400);
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [profiles]=await db.execute<RowDataPacket[]>(
   "SELECT user_id FROM customer_creator_profiles WHERE user_id=? FOR UPDATE",[access.userId]);
  if(!profiles.length){await db.rollback();return fail("CREATOR_PROFILE_REQUIRED",409);}
  const [media]=await db.execute<RowDataPacket[]>(
   "SELECT id FROM user_media_library WHERE id=? AND user_id=? LIMIT 1",[input.mediaId,access.userId]);
  if(!media.length){await db.rollback();return fail("MEDIA_NOT_FOUND",404);}
  const [[count]]=await db.execute<RowDataPacket[]>(
   "SELECT COUNT(*) AS n FROM customer_creator_portfolio WHERE user_id=?",[access.userId]);
  if(Number(count.n)>=CREATOR_PORTFOLIO_LIMIT){await db.rollback();return fail("PORTFOLIO_LIMIT_REACHED",409);}
  const id=randomUUID();
  await db.execute(
   "INSERT INTO customer_creator_portfolio(id,user_id,media_id,caption) VALUES (?,?,?,?)",
   [id,access.userId,input.mediaId,input.caption]);
  await db.commit();return NextResponse.json({ok:true,id},{status:201,headers});
 }catch(error){
  await db.rollback();
  if((error as {code?:string})?.code==="ER_DUP_ENTRY")return fail("MEDIA_ALREADY_PUBLISHED",409);
  return fail("PORTFOLIO_SAVE_FAILED",503);
 }finally{db.release();}
}
export async function DELETE(request:Request){
 try{assertSameOrigin(request);}catch{return fail("FORBIDDEN",403);}
 const access=await scope();if(access.error)return access.error;
 const parsed=await readCreatorMutationJson(request,512);
 if(parsed.error)return fail(parsed.error.code,parsed.error.status);
 const body=parsed.body as {id?:unknown}|null;
 const id=typeof body?.id==="string"?body.id:"";
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return fail("INVALID_INPUT",400);
 try{
  const [result]=await database().execute<ResultSetHeader>(
   "DELETE FROM customer_creator_portfolio WHERE id=? AND user_id=?",[id,access.userId]);
  if(result.affectedRows===0)return fail("PORTFOLIO_ITEM_NOT_FOUND",404);
  return NextResponse.json({ok:true},{headers});
 }catch{return fail("PORTFOLIO_DELETE_FAILED",503);}
}
