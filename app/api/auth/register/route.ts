import {validStoreSlug} from "@/scripts/store-slug.mjs";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { database } from "@/lib/db/mysql";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { provisionStore } from "@/scripts/provision-store.mjs";

const restaurantActivities=new Set(["restaurant","cafe","sweets"]);
const storeActivities=new Set(["grocery","clothing","perfume","accessories","gifts","ecommerce","carwash","laundry","automotive","salon","publicworks"]);
export const runtime="nodejs";
export async function POST(request:Request){
  try{
    try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
    const body=await request.json().catch(()=>null);
    if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
    const email=String(body.email??"").trim().toLowerCase();
    const password=String(body.password??"");
    const name=String(body.name??"").trim().slice(0,180);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || password.length<9 || password.length>128) return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
    const activity=typeof body.activity==="string"?body.activity:"";
    if(!restaurantActivities.has(activity)&&!storeActivities.has(activity))return NextResponse.json({ok:false,code:"ACTIVITY_REQUIRED"},{status:400});
    const countryCode=String(body.countryCode??"");
    const defaults:Record<string,{currency:string;tax:number}>={SA:{currency:"SAR",tax:15},AE:{currency:"AED",tax:5},BH:{currency:"BHD",tax:10},KW:{currency:"KWD",tax:0},OM:{currency:"OMR",tax:5},QA:{currency:"QAR",tax:0},EG:{currency:"EGP",tax:14},JO:{currency:"JOD",tax:16},FR:{currency:"EUR",tax:20},US:{currency:"USD",tax:0}};
    if(!defaults[countryCode]||body.currency!==defaults[countryCode].currency||typeof body.taxRate!=="number"||!Number.isFinite(body.taxRate)||body.taxRate<0||body.taxRate>100)return NextResponse.json({ok:false,code:"INVALID_LOCALE"},{status:400});
    const id=randomUUID(), hash=await hashPassword(password);
    const storeName=typeof body.storeName==="string"?body.storeName.trim():name||"متجري";
    const slug=typeof body.slug==="string"?body.slug.trim().toLowerCase():"store-"+id;
    if(storeName.length<2||storeName.length>180||!validStoreSlug(slug)||body.kind!==undefined&&!['store','restaurant'].includes(body.kind))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
    const db=await database().getConnection();
    let stage="user";
    try{
      await db.beginTransaction();
      await db.execute("INSERT INTO users(id,email,password_hash,display_name,status) VALUES (?,?,?,?,?)",[id,email,hash,name||null,"active"]);
      stage="store";
      const workspace=await provisionStore(db,{ownerId:id,name:storeName,slug,kind:restaurantActivities.has(activity)?"restaurant":"store"});
      await db.execute("INSERT INTO tenant_business_profiles(tenant_id,activity_code,country_code,currency,tax_rate) VALUES (?,?,?,?,?)",[workspace.tenant.id,activity,countryCode,defaults[countryCode].currency,body.taxRate]);
      await createSession(id,db);
      await db.commit();
      return NextResponse.json({ok:true,user:{id,email},...workspace,plan:"free"},{status:201});
    }catch(error){
      await db.rollback();
      if((error as {code?:string}).code==="ER_DUP_ENTRY")return NextResponse.json({ok:false,code:stage==="user"?"EMAIL_EXISTS":"SLUG_EXISTS"},{status:409});
      throw error;
    }finally{db.release();}
  }catch(error){
    const code=(error as {code?:string})?.code;
    if(code==="ER_DUP_ENTRY") return NextResponse.json({ok:false,code:"EMAIL_EXISTS"},{status:409});
    return NextResponse.json({ok:false,code:"REGISTER_UNAVAILABLE"},{status:503});
  }
}
