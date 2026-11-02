import {NextResponse} from "next/server";
import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {customerCreatorUserId} from "@/lib/creator/authorization";
import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {assertSameOrigin} from "@/lib/security/origin";
import {readCreatorMutationJson} from "@/lib/creator/request-body";
import {parseCreatorSocialLinks} from "@/lib/creator/social-links";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const cache={"Cache-Control":"private, no-store"};
function fail(code:string,status:number){return NextResponse.json({ok:false,code},{status,headers:cache});}
async function actor(){
 const user=await currentUserId();if(!user)return {error:fail("UNAUTHENTICATED",401)};
 const denied=await employeePersonalAccessDenied();if(denied)return {error:denied};
 const id=await customerCreatorUserId();return id?{id}:{error:fail("CUSTOMER_ACCOUNT_REQUIRED",403)};
}
export async function GET(){
 const a=await actor();if(a.error)return a.error;
 try{
  const [links]=await database().execute<RowDataPacket[]>(
   "SELECT platform,url FROM customer_creator_social_links WHERE user_id=? ORDER BY display_order,platform",[a.id]);
  return NextResponse.json({ok:true,links},{headers:cache});
 }catch{return fail("SOCIAL_LINKS_UNAVAILABLE",503);}
}
export async function PUT(request:Request){
 try{assertSameOrigin(request);}catch{return fail("FORBIDDEN",403);}
 const a=await actor();if(a.error)return a.error;
 const parsed=await readCreatorMutationJson(request,32768);
 if(parsed.error)return fail(parsed.error.code,parsed.error.status);
 const body=parsed.body as {links?:unknown}|null;
 const links=parseCreatorSocialLinks(body?.links);
 if(!links)return fail("INVALID_SOCIAL_LINK",400);
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [users]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE",[a.id]);
  if(!users.length){await db.rollback();return fail("UNAUTHENTICATED",401);}
  const [disqualified]=await db.execute<RowDataPacket[]>(
   "SELECT 1 FROM memberships WHERE user_id=? UNION ALL SELECT 1 FROM platform_admins WHERE user_id=? LIMIT 1",[a.id,a.id]);
  if(disqualified.length){await db.rollback();return fail("CUSTOMER_ACCOUNT_REQUIRED",403);}
  const [profiles]=await db.execute<RowDataPacket[]>(
   "SELECT user_id FROM customer_creator_profiles WHERE user_id=? FOR UPDATE",[a.id]);
  if(!profiles.length){await db.rollback();return fail("CREATOR_PROFILE_REQUIRED",409);}
  await db.execute("DELETE FROM customer_creator_social_links WHERE user_id=?",[a.id]);
  for(let i=0;i<links.length;i++){
   const item=links[i];
   await db.execute(
    "INSERT INTO customer_creator_social_links(user_id,platform,url,display_order) VALUES (?,?,?,?)",
    [a.id,item.platform,item.url,i]);
  }
  await db.commit();return NextResponse.json({ok:true,links},{headers:cache});
 }catch{await db.rollback();return fail("SOCIAL_LINKS_SAVE_FAILED",503);}finally{db.release();}
}
