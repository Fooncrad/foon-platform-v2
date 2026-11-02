import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {isActivityType} from "@/lib/platform/activity-presets";
import {activityFeatureSupport,isCreatorOnlyFeature} from "@/lib/platform/activity-plan-entitlements";
type Context={params:Promise<{id:string}>};
async function authorize(write:boolean){
 const actor=await currentActiveAdminUserId();if(!actor)return {error:NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401})};
 try{await requirePlatformRole(actor,write?["super_admin","admin"]:["super_admin","admin","support"]);return {actor};}catch{return {error:NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})};}
}
export async function GET(request:Request,context:Context){
 const auth=await authorize(false);if(auth.error)return auth.error;
 const {id}=await context.params,activity=new URL(request.url).searchParams.get("activity")??"";
 if(activity&&!isActivityType(activity))return NextResponse.json({ok:false,code:"INVALID_ACTIVITY"},{status:400});
 try{
  const [plans]=await database().execute<RowDataPacket[]>("SELECT id FROM package_plans WHERE id=?",[id]);if(!plans.length)return NextResponse.json({ok:false,code:"PLAN_NOT_FOUND"},{status:404});
  const [features]=await database().execute<RowDataPacket[]>("SELECT f.feature_key,f.name_ar,f.name_en,f.category,f.value_type,COALESCE(af.enabled,pf.enabled,0) AS enabled,CASE WHEN af.plan_id IS NOT NULL THEN af.limit_value ELSE pf.limit_value END AS limit_value,(af.plan_id IS NOT NULL) AS overridden FROM package_features f JOIN package_plans p ON p.id=? LEFT JOIN package_plan_features pf ON pf.feature_key=f.feature_key AND pf.plan_id=p.id LEFT JOIN package_plan_activity_features af ON af.plan_id=p.id AND af.feature_key=f.feature_key AND af.activity_code=? ORDER BY f.category,f.feature_key",[id,activity]);
  return NextResponse.json({ok:true,features,activity:activity||null},{headers:{"Cache-Control":"no-store, private"}});
 }catch{return NextResponse.json({ok:false,code:"FEATURES_UNAVAILABLE"},{status:503});}
}
async function mutate(request:Request,context:Context,reset:boolean){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const auth=await authorize(true);if(auth.error)return auth.error;
 const {id}=await context.params,body=await request.json().catch(()=>null);
 if(!body||typeof body.feature_key!=="string"||!/^[a-z][a-z0-9._-]{1,99}$/.test(body.feature_key)||body.activity!==undefined&&(typeof body.activity!=="string"||!isActivityType(body.activity))||reset&&!body.activity||!reset&&(typeof body.enabled!=="boolean"||body.limit_value!==null&&body.limit_value!==undefined&&(!Number.isSafeInteger(body.limit_value)||body.limit_value<0||body.limit_value>2147483647)))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 // A shared plan may have every feature, but an activity override may only
 // configure a feature that the activity can actually use. Reset remains
 // available to clean up legacy, irrelevant overrides.
 if(!reset&&isCreatorOnlyFeature(body.feature_key))return NextResponse.json({ok:false,code:"FEATURE_NOT_APPLICABLE"},{status:422});
 if(body.activity&&!reset&&activityFeatureSupport(body.activity,body.feature_key)!=="supported")
  return NextResponse.json({ok:false,code:"FEATURE_NOT_APPLICABLE"},{status:422});
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [plans]=await db.execute<RowDataPacket[]>("SELECT id FROM package_plans WHERE id=? FOR UPDATE",[id]);if(!plans.length){await db.rollback();return NextResponse.json({ok:false,code:"PLAN_NOT_FOUND"},{status:404});}
  const [features]=await db.execute<RowDataPacket[]>("SELECT feature_key FROM package_features WHERE feature_key=?",[body.feature_key]);if(!features.length){await db.rollback();return NextResponse.json({ok:false,code:"FEATURE_NOT_FOUND"},{status:404});}
  if(reset)await db.execute("DELETE FROM package_plan_activity_features WHERE plan_id=? AND activity_code=? AND feature_key=?",[id,body.activity,body.feature_key]);
  else if(body.activity)await db.execute("INSERT INTO package_plan_activity_features(plan_id,activity_code,feature_key,enabled,limit_value) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),limit_value=VALUES(limit_value)",[id,body.activity,body.feature_key,body.enabled,body.limit_value??null]);
  else await db.execute("INSERT INTO package_plan_features(plan_id,feature_key,enabled,limit_value) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),limit_value=VALUES(limit_value)",[id,body.feature_key,body.enabled,body.limit_value??null]);
  await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id,metadata_json) VALUES (?,?,?,?,?)",[auth.actor,reset?"plan.activity_feature.reset":"plan.feature.update","plan",id,JSON.stringify({activity:body.activity??null,feature:body.feature_key,...(!reset?{enabled:body.enabled,limit:body.limit_value??null}:{})})]);
  await db.commit();return NextResponse.json({ok:true});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"FEATURE_SAVE_UNAVAILABLE"},{status:503});}finally{db.release();}
}
export async function PUT(request:Request,context:Context){return mutate(request,context,false);}
export async function DELETE(request:Request,context:Context){return mutate(request,context,true);}
