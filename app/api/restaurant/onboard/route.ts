import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {recordCreatorReferral} from "@/lib/creator/subscription-commission";
import {isActivityType,defaultActivityModules} from "@/lib/platform/activity-presets";
import {currencyForCountry,countryRegions} from "@/lib/tenant/country-catalog";
import {validStoreSlug} from "@/scripts/store-slug.mjs";
import { provisionStore } from "@/scripts/provision-store.mjs";
import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth/session";
import { database } from "@/lib/db/mysql";
import { assertSameOrigin } from "@/lib/security/origin";
import { readLimitedJson } from "@/lib/security/limited-json";

export const runtime="nodejs";
export async function POST(request:Request){
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const userId=await currentUserId();if(!userId)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 let body:Record<string,unknown>|null;
 try{body=await readLimitedJson(request,8192) as Record<string,unknown>|null;}
 catch(error){const large=error instanceof Error&&error.message==="BATCH_TOO_LARGE";return NextResponse.json({ok:false,code:large?"BODY_TOO_LARGE":"INVALID_INPUT"},{status:large?413:400});}
 if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 if(body.legalAccepted!==true)return NextResponse.json({ok:false,code:"LEGAL_CONSENT_REQUIRED"},{status:400});
 const name=typeof body.name==="string"?body.name.trim():"";
 const slug=typeof body.slug==="string"?body.slug.trim().toLowerCase():"";
 const activity=typeof body.activity==="string"?body.activity:"";
 if(!isActivityType(activity))return NextResponse.json({ok:false,code:"ACTIVITY_REQUIRED"},{status:400});
 const countryCode=typeof body.countryCode==="string"?body.countryCode:"";
 const currency=currencyForCountry(countryCode),region=typeof body.region==="string"?body.region.trim():"";
 const taxNumber=typeof body.taxNumber==="string"?body.taxNumber.trim():"";
 if(!currency||body.currency!==currency||region.length<2||region.length>120||taxNumber.length>64||countryRegions[countryCode]&&!countryRegions[countryCode].includes(region))return NextResponse.json({ok:false,code:"INVALID_LOCALE"},{status:400});
 const kind=["restaurant","cafe","sweets"].includes(activity)?"restaurant":"store";
 if(name.length<2||name.length>180||!validStoreSlug(slug))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [users]=await db.execute<import("mysql2/promise").RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status='active' LIMIT 1",[userId]);
  if(!users.length){await db.rollback();return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
  await db.execute("UPDATE users SET legal_accepted_at=COALESCE(legal_accepted_at,NOW()) WHERE id=?",[userId]);
  const workspace=await provisionStore(db,{ownerId:userId,name,slug,kind});
  await db.execute("INSERT INTO tenant_business_profiles(tenant_id,activity_code,country_code,currency,region,tax_number) VALUES (?,?,?,?,?,?)",[workspace.tenant.id,activity,countryCode,currency,region,taxNumber||null]);
  await recordCreatorReferral(db,workspace.tenant.id,userId,body.referralHandle);
  await db.commit();
  return NextResponse.json({ok:true,...workspace,activity,activityModules:defaultActivityModules(activity),plan:"free"},{status:201});
 }catch(error){
  await db.rollback();
  if((error as Error).message==="REFERRAL_INVALID")return NextResponse.json({ok:false,code:"REFERRAL_INVALID"},{status:400});
  if((error as {code?:string}).code==="ER_DUP_ENTRY")return NextResponse.json({ok:false,code:"SLUG_EXISTS"},{status:409});
  return NextResponse.json({ok:false,code:"ONBOARD_UNAVAILABLE"},{status:503});
 }finally{db.release();}
}
