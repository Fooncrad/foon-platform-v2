import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {cookies} from "next/headers";
import {notifyCustomer} from "@/lib/notifications/customer";
import {dispatchNotifications} from "@/lib/notifications/dispatch";
import {queueVerificationMail,type VerificationLocale} from "@/lib/auth/email-verification";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { database } from "@/lib/db/mysql";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { registerCustomer } from "@/scripts/register-customer.mjs";

export const runtime="nodejs";
export async function POST(request:Request){
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
 const password=typeof body.password==="string"?body.password:"";
 const name=typeof body.name==="string"?body.name.trim():"";
 const storeSlug=typeof body.storeSlug==="string"?body.storeSlug.trim().toLowerCase():"";
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<9||password.length>128||name.length>180||!/^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$/.test(storeSlug))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{
  const hash=await hashPassword(password),id=randomUUID(),db=await database().getConnection();
  try{
   await db.beginTransaction();
   const {tenantId}=await registerCustomer(db,{id,email,passwordHash:hash,name,storeSlug});
   const locale=(await cookies()).get("foon_language")?.value;
   await db.execute("UPDATE users SET default_locale=? WHERE id=?",[locale==="en"||locale==="fr"?locale:"ar",id]);
   await notifyCustomer(db,{userId:id,tenantId:tenantId,event:"account_welcome",resourceId:id});
   await queueVerificationMail(db,{userId:id,email,locale:(locale==="en"||locale==="fr"?locale:"ar") as VerificationLocale,origin:process.env.APP_URL||"https://nfoodz.com"});
   await createSession(id,db);
   await db.commit();dispatchNotifications();
   return NextResponse.json({ok:true,user:{id,email},tenantId,redirect:"/customer"},{status:201});
  }catch(error){await db.rollback();throw error;}finally{db.release();}
 }catch(error){
  if((error as {code?:string}).code==="ER_DUP_ENTRY")return NextResponse.json({ok:false,code:"EMAIL_EXISTS"},{status:409});
  if(error instanceof Error&&error.message==="STORE_NOT_FOUND")return NextResponse.json({ok:false,code:"STORE_NOT_FOUND"},{status:404});
  return NextResponse.json({ok:false,code:"REGISTER_UNAVAILABLE"},{status:503});
 }
}
