import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {assertSameOrigin} from "@/lib/security/origin";
import {queueVerificationMail,verificationCooldownActive,type VerificationLocale} from "@/lib/auth/email-verification";
import {dispatchNotifications} from "@/lib/notifications/dispatch";
export const runtime="nodejs";
const json=(body:Record<string,unknown>,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store, private"}});
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return json({ok:false,code:"FORBIDDEN"},403);}
 const user=await currentUserId();if(!user)return json({ok:false,code:"UNAUTHENTICATED"},401);
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [users]=await db.execute<RowDataPacket[]>("SELECT email,status,email_verified_at,default_locale FROM users WHERE id=? FOR UPDATE",[user]);
  if(!users.length||users[0].status!=="active"){await db.rollback();return json({ok:false,code:"UNAUTHENTICATED"},401);}
  if(users[0].email_verified_at){await db.commit();return json({ok:true,verified:true,queued:false});}
  if(await verificationCooldownActive(db,user)){
   await db.commit();return json({ok:true,verified:false,queued:false,retryAfterSeconds:300});
  }
  const locale=users[0].default_locale==="en"||users[0].default_locale==="fr"?users[0].default_locale:"ar";
  await queueVerificationMail(db,{userId:user,email:String(users[0].email),locale:locale as VerificationLocale,origin:process.env.APP_URL||"https://nfoodz.com"});
  await db.commit();dispatchNotifications();
  return json({ok:true,verified:false,queued:true});
 }catch{await db.rollback();return json({ok:false,code:"VERIFICATION_SEND_UNAVAILABLE"},503);}finally{db.release();}
}
