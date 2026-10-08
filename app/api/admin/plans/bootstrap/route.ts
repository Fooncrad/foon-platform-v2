import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { database } from "@/lib/db/mysql";
import { currentActiveAdminUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";
import { assertSameOrigin } from "@/lib/security/origin";
import { referenceFeatures } from "@/lib/plans/reference-catalog";

const tiers=[
 {code:"free",ar:"مجانية",en:"Free",fr:"Gratuit",rank:0},
 {code:"starter",ar:"أساسية",en:"Starter",fr:"Débutant",rank:1},
 {code:"professional",ar:"احترافية",en:"Professional",fr:"Professionnel",rank:2},
 {code:"enterprise",ar:"أعمال",en:"Enterprise",fr:"Entreprise",rank:3}
] as const;
const basic=new Set(["digital_menu","qr_menu","branding.logo","branding.colors","storefront","catalog","orders"]);
const starter=new Set([...basic,"menu_templates","branding.dark_mode","branding.menu_theme","tables","waiter_call","reservations","waitlist","takeaway","delivery","employees","reviews","coupons","analytics","variants","pickup","customers","service_catalog","appointments","queue","payments"]);
const professional=new Set([...starter,"pos","kds","inventory","purchases","suppliers","loyalty","campaigns","multi_branch","content_library","storage","branding.qr","room_service","nfc_menu","media_library","creator_profile","content_pricing","sales"]);
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const actor=await currentActiveAdminUserId();if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(actor,["super_admin","admin"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const body=await request.json().catch(()=>null);
 if(!body||body.confirm!=="CREATE_FOUR_PLANS")return NextResponse.json({ok:false,code:"CONFIRMATION_REQUIRED"},{status:400});
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  for(const [key,ar,en,category] of referenceFeatures){
   await db.execute("INSERT IGNORE INTO package_features(feature_key,name_ar,name_en,category,value_type) VALUES (?,?,?,?,'boolean')",[key,ar,en,category]);
  }
  for(const tier of tiers){
   await db.execute("INSERT IGNORE INTO package_plans(id,code,name_ar,name_en,name_fr,sort_order) VALUES (?,?,?,?,?,?)",[randomUUID(),tier.code,tier.ar,tier.en,tier.fr,tier.rank]);
   const [rows]=await db.execute<RowDataPacket[]>("SELECT id FROM package_plans WHERE code=? LIMIT 1",[tier.code]);
   const id=String(rows[0].id);
   for(const [key] of referenceFeatures){
    const enabled=tier.rank===3||tier.rank===2&&professional.has(key)||tier.rank===1&&starter.has(key)||tier.rank===0&&basic.has(key);
    await db.execute("INSERT IGNORE INTO package_plan_features(plan_id,feature_key,enabled,limit_value) VALUES (?,?,?,NULL)",[id,key,enabled]);
   }
  }
  await db.commit();
  return NextResponse.json({ok:true,plans:tiers.map(t=>t.code),features:referenceFeatures.length,note:"Feature grants are catalog configuration, not evidence of implemented runtime modules. Prices remain unset."});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"BOOTSTRAP_UNAVAILABLE"},{status:503});}finally{db.release();}
}
