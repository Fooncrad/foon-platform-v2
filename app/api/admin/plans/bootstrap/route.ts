import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { database } from "@/lib/db/mysql";
import { currentActiveAdminUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";
import { assertSameOrigin } from "@/lib/security/origin";
import { referenceFeatures } from "@/lib/plans/reference-catalog";
import {ACTIVITY_PRESETS} from "@/lib/platform/activity-presets";

const tiers=[
 {code:"free",ar:"مجانية",en:"Free",fr:"Gratuit",rank:0},
 {code:"starter",ar:"أساسية",en:"Starter",fr:"Débutant",rank:1},
 {code:"professional",ar:"احترافية",en:"Professional",fr:"Professionnel",rank:2},
 {code:"enterprise",ar:"أعمال",en:"Enterprise",fr:"Entreprise",rank:3}
] as const;
const basic=new Set(["digital_menu","qr_menu","branding.logo","branding.colors","storefront","catalog","orders"]);
const starter=new Set([...basic,"menu_templates","branding.dark_mode","branding.menu_theme","tables","waiter_call","reservations","waitlist","takeaway","delivery","employees","reviews","coupons","analytics","variants","pickup","customers","service_catalog","appointments","queue","payments"]);
const professional=new Set([...starter,"pos","kds","inventory","purchases","suppliers","loyalty","campaigns","multi_branch","content_library","storage","branding.qr","room_service","nfc_menu","media_library","creator_profile","content_pricing","sales"]);
const freeActivityCodes=Object.keys(ACTIVITY_PRESETS);
const freeCatalogKeys=new Set(["digital_menu","catalog"]);
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
  let freePlanId="";
  for(const tier of tiers){
   await db.execute("INSERT IGNORE INTO package_plans(id,code,name_ar,name_en,name_fr,sort_order) VALUES (?,?,?,?,?,?)",[randomUUID(),tier.code,tier.ar,tier.en,tier.fr,tier.rank]);
   const [rows]=await db.execute<RowDataPacket[]>("SELECT id FROM package_plans WHERE code=? LIMIT 1",[tier.code]);
   const id=String(rows[0].id);
   if(tier.code==="free")freePlanId=id;
   for(const [key] of referenceFeatures){
    const enabled=tier.rank===3||tier.rank===2&&professional.has(key)||tier.rank===1&&starter.has(key)||tier.rank===0&&basic.has(key);
    // Initialize only new shared grants; never rewrite saved settings.
    const limit=tier.code==="free"&&freeCatalogKeys.has(key)?20:null;
    await db.execute("INSERT IGNORE INTO package_plan_features(plan_id,feature_key,enabled,limit_value) VALUES (?,?,?,?)",[id,key,enabled,limit]);
   }
  }
  // Migration 0093 may have run before the free plan existed. Seed missing
  // activity defaults after bootstrap, preserving all previous overrides.
  const activityQuery=freeActivityCodes.map((_,i)=>i===0?"SELECT ? AS activity_code":"UNION ALL SELECT ?").join(" ");
  await db.execute(
   "INSERT IGNORE INTO package_plan_activity_features(plan_id,activity_code,feature_key,enabled,limit_value) "+
   "SELECT ?,a.activity_code,pf.feature_key,pf.enabled,CASE WHEN pf.feature_key IN ('digital_menu','catalog') "+
   "THEN LEAST(COALESCE(pf.limit_value,20),20) ELSE pf.limit_value END "+
   "FROM package_plan_features pf CROSS JOIN ("+activityQuery+") a WHERE pf.plan_id=?",
   [freePlanId,...freeActivityCodes,freePlanId]
  );
  await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id,metadata_json) VALUES (?,?,?,?,?)",
   [actor,"plan.bootstrap","plan",freePlanId,JSON.stringify({plans:tiers.map(t=>t.code),activityCount:freeActivityCodes.length,freeCatalogMax:20})]);
  await db.commit();
  return NextResponse.json({ok:true,plans:tiers.map(t=>t.code),features:referenceFeatures.length,freeActivities:freeActivityCodes.length,note:"Missing free activity defaults are bounded at 20 categories and items. Existing overrides and paid subscriptions are unchanged; prices remain unset."});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"BOOTSTRAP_UNAVAILABLE"},{status:503});}finally{db.release();}
}
