import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {queueLoginAlert} from "@/lib/auth/login-alert";
import {recordCreatorReferral} from "@/lib/creator/subscription-commission";
import {cookies} from "next/headers";
import {notifyCustomer} from "@/lib/notifications/customer";
import {dispatchNotifications} from "@/lib/notifications/dispatch";
import {queueVerificationMail,type VerificationLocale} from "@/lib/auth/email-verification";
import {defaultActivityModules,isActivityType} from "@/lib/platform/activity-presets";
import {validStoreSlug} from "@/scripts/store-slug.mjs";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { database } from "@/lib/db/mysql";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { provisionStore } from "@/scripts/provision-store.mjs";
import {currencyForCountry,countryRegions} from "@/lib/tenant/country-catalog";

const restaurantActivities=new Set(["restaurant","cafe","sweets"]);
const storeActivities=new Set(["grocery","clothing","perfume","accessories","watches","gifts","ecommerce","carwash","laundry","automotive","salon","publicworks"]);
export const runtime="nodejs";
export async function POST(request:Request){
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
  try{
    try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
    const body=await request.json().catch(()=>null);
    if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
    if(body.legalAccepted!==true)return NextResponse.json({ok:false,code:"LEGAL_CONSENT_REQUIRED"},{status:400});
    const email=String(body.email??"").trim().toLowerCase();
    const password=String(body.password??"");
    const name=String(body.name??"").trim().slice(0,180);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || password.length<9 || password.length>128) return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
    const activity=typeof body.activity==="string"?body.activity:"";
    if(!isActivityType(activity))return NextResponse.json({ok:false,code:"ACTIVITY_REQUIRED"},{status:400});
    const activityModules=defaultActivityModules(activity);
    const countryCode=String(body.countryCode??"");
    const currency=currencyForCountry(countryCode);
    const region=typeof body.region==="string"?body.region.trim():"";
    const taxNumber=typeof body.taxNumber==="string"?body.taxNumber.trim():"";
    if(!currency||body.currency!==currency||region.length<2||region.length>120||taxNumber.length>64||countryRegions[countryCode]&&!countryRegions[countryCode].includes(region))return NextResponse.json({ok:false,code:"INVALID_LOCALE"},{status:400});
    const id=randomUUID(), hash=await hashPassword(password);
    const storeName=typeof body.storeName==="string"?body.storeName.trim():name||"متجري";
    const slug=typeof body.slug==="string"?body.slug.trim().toLowerCase():"store-"+id;
    if(storeName.length<2||storeName.length>180||!validStoreSlug(slug)||body.kind!==undefined&&!['store','restaurant'].includes(body.kind))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
    const db=await database().getConnection();
    let stage="user";
    try{
      await db.beginTransaction();
      await db.execute("INSERT INTO users(id,email,password_hash,display_name,status) VALUES (?,?,?,?,?)",[id,email,hash,name||null,"active"]);
      await db.execute("UPDATE users SET legal_accepted_at=NOW() WHERE id=?",[id]);
      stage="store";
      const workspace=await provisionStore(db,{ownerId:id,name:storeName,slug,kind:restaurantActivities.has(activity)?"restaurant":"store"});
      await db.execute("INSERT INTO tenant_business_profiles(tenant_id,activity_code,country_code,currency,region,tax_number) VALUES (?,?,?,?,?,?)",[workspace.tenant.id,activity,countryCode,currency,region,taxNumber||null]);
      await recordCreatorReferral(db,workspace.tenant.id,id,body.referralHandle);
      const locale=(await cookies()).get("foon_language")?.value;
   await db.execute("UPDATE users SET default_locale=? WHERE id=?",[locale==="en"||locale==="fr"?locale:"ar",id]);
   await notifyCustomer(db,{userId:id,tenantId:workspace.tenant.id,event:"account_welcome",resourceId:id});
   await queueVerificationMail(db,{userId:id,email,locale:(locale==="en"||locale==="fr"?locale:"ar") as VerificationLocale,origin:process.env.APP_URL||"https://nfoodz.com"});
   await createSession(id,db);
      await db.commit();
      await queueLoginAlert(database(),id,request,"registration");
      dispatchNotifications();
      return NextResponse.json({ok:true,user:{id,email},...workspace,activity,activityModules,plan:"free",emailVerificationRequired:true},{status:201});
    }catch(error){
      await db.rollback();
      if((error as Error).message==="REFERRAL_INVALID")return NextResponse.json({ok:false,code:"REFERRAL_INVALID"},{status:400});
      if((error as {code?:string}).code==="ER_DUP_ENTRY")return NextResponse.json({ok:false,code:stage==="user"?"EMAIL_EXISTS":"SLUG_EXISTS"},{status:409});
      throw error;
    }finally{db.release();}
  }catch(error){
    const code=(error as {code?:string})?.code;
    if(code==="ER_DUP_ENTRY") return NextResponse.json({ok:false,code:"EMAIL_EXISTS"},{status:409});
    return NextResponse.json({ok:false,code:"REGISTER_UNAVAILABLE"},{status:503});
  }
}
