import {ACTIVITY_PRESETS} from "../lib/platform/activity-presets.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {resolveActivityEntitlements,canUseActivityFeature,activityFeatureCapability,activityFeatureSupport,passesServerActivityRestriction} from "../lib/platform/activity-plan-entitlements.ts";

test("restaurant tables are unavailable to carwash regardless of grant",()=>{
 const grants=[{feature_key:"tables",enabled:true,limit_value:null},{feature_key:"services",enabled:true,limit_value:100}];
 assert.equal(canUseActivityFeature("carwash","tables",grants),false);
 assert.equal(canUseActivityFeature("carwash","services",grants),true);
});
test("missing grants deny access instead of silently enabling paid modules",()=>{
 assert.equal(canUseActivityFeature("restaurant","pos",[]),false);
 assert.equal(resolveActivityEntitlements("restaurant",[]).find(x=>x.key==="pos")?.reason,"not_granted");
});
test("employee permissions narrow but never expand plan grants",()=>{
 const grants=[{feature_key:"pos",enabled:true,limit_value:1},{feature_key:"inventory",enabled:false,limit_value:null}];
 assert.equal(canUseActivityFeature("grocery","pos",grants,["inventory"]),false);
 assert.equal(canUseActivityFeature("grocery","inventory",grants,["inventory"]),false);
 assert.equal(canUseActivityFeature("grocery","pos",grants,["pos"]),true);
});
test("unsupported activity codes fail closed",()=>{
 assert.throws(()=>resolveActivityEntitlements("unknown",[]),/UNSUPPORTED_ACTIVITY_TYPE/);
});
test("every defined activity only enables explicitly supported modules",()=>{
 
 for(const [activity,modules] of Object.entries(ACTIVITY_PRESETS)){
  const grants=modules.map(feature_key=>({feature_key,enabled:true,limit_value:10}));
  for(const key of modules)assert.equal(canUseActivityFeature(activity,key,grants),true);
  if(activity!=="restaurant"&&activity!=="cafe")assert.equal(canUseActivityFeature(activity,"waiter",[...grants,{feature_key:"waiter",enabled:true,limit_value:null}]),false);
 }
});

test("POS and delivery are supported for every activity but still require an active grant",()=>{
 for(const activity of Object.keys(ACTIVITY_PRESETS)){
  const grants=["pos","delivery"].map(feature_key=>({feature_key,enabled:true,limit_value:10}));
  assert.equal(canUseActivityFeature(activity,"pos",grants),true,activity+" POS");
  assert.equal(canUseActivityFeature(activity,"delivery",grants),true,activity+" delivery");
  assert.equal(canUseActivityFeature(activity,"delivery",[{feature_key:"delivery",enabled:false,limit_value:null}]),false,activity+" disabled delivery");
 }
});


test("feature aliases follow activity support while retaining exact grants and limits",()=>{
 const cases=[["restaurant","kds",true],["carwash","kds",false],["restaurant","waiter_call",true],["salon","waiter_call",false],["carwash","service_catalog",true],["restaurant","service_catalog",false],["salon","appointments",true],["grocery","appointments",false],["restaurant","digital_menu",true],["carwash","digital_menu",false],["grocery","qr_menu",true],["grocery","takeaway",true]];
 for(const [activity,key,supported] of cases){
  const result=resolveActivityEntitlements(activity,[{feature_key:key,enabled:true,limit_value:0}]).find(row=>row.key===key);
  assert.equal(result.available,supported,activity+":"+key);assert.equal(result.limit,0);
 }
 const grants=[{feature_key:"digital_menu",enabled:true,limit_value:30},{feature_key:"qr_menu",enabled:false,limit_value:1}];
 assert.equal(canUseActivityFeature("restaurant","digital_menu",grants),true);
 assert.equal(canUseActivityFeature("restaurant","qr_menu",grants),false);
 assert.equal(canUseActivityFeature("restaurant","catalog",grants),false,"an alias must not invent a separate grant");
 assert.equal(canUseActivityFeature("restaurant","digital_menu",grants,["catalog"]),false,"permissions remain exact keys");
});
test("unclassified keys stay denied even when their grant is enabled",()=>{
 assert.equal(canUseActivityFeature("carwash","future_feature",[{feature_key:"future_feature",enabled:true,limit_value:null}]),false);
 for(const key of ["constructor","toString","__proto__"])assert.equal(canUseActivityFeature("restaurant",key,[{feature_key:key,enabled:true,limit_value:null}]),false);
});
test("duplicate and malformed grants fail closed instead of using last-write wins",()=>{
 const enabled={feature_key:"pos",enabled:true,limit_value:null};
 for(const grants of [[enabled,{...enabled,enabled:false}],[{...enabled,enabled:false},enabled]])assert.throws(()=>resolveActivityEntitlements("grocery",grants),/DUPLICATE_PLAN_GRANT/);
 for(const limit of [-1,1.5,NaN,Infinity])assert.throws(()=>resolveActivityEntitlements("grocery",[{...enabled,limit_value:limit}]),/INVALID_PLAN_GRANT/);
 assert.throws(()=>resolveActivityEntitlements("grocery",[{...enabled,enabled:"false"}]),/INVALID_PLAN_GRANT/);
});

test("admin classification and resolver share the same alias policy",()=>{
 for(const activity of Object.keys(ACTIVITY_PRESETS)){
  for(const key of ["waiter_call","kds","service_catalog","appointments","takeaway","digital_menu","qr_menu"]){
   const expected=key==="qr_menu"||ACTIVITY_PRESETS[activity].includes(activityFeatureCapability(key));
   assert.equal(activityFeatureSupport(activity,key),expected?"supported":"unsupported");
   assert.equal(canUseActivityFeature(activity,key,[{feature_key:key,enabled:true,limit_value:null}]),expected);
  }
  assert.equal(activityFeatureSupport(activity,"future_feature"),"unclassified");
 }
 assert.throws(()=>activityFeatureSupport("unknown","pos"),/UNSUPPORTED_ACTIVITY_TYPE/);
});


test("server dining restrictions cover every registered activity without granting shared features",()=>{
 for(const activity of Object.keys(ACTIVITY_PRESETS)){
  const dining=activity==="restaurant"||activity==="cafe";
  for(const key of ["tables","reservations","waitlist","kds","waiter_call"])assert.equal(passesServerActivityRestriction(activity,key),dining,activity+":"+key);
  for(const key of ["pos","delivery","customer_invoices","quotes"])assert.equal(passesServerActivityRestriction(activity,key),true,"existing entitlement remains mandatory for "+key);
  assert.equal(passesServerActivityRestriction(activity,"variants"),ACTIVITY_PRESETS[activity].includes("variants")||dining||activity==="grocery",activity+":variants");
 }
});
test("server restriction preserves legacy profile behavior while strict resolver still rejects unknown types",()=>{
 for(const activity of [null,undefined,"","legacy-unknown"]){
  assert.equal(passesServerActivityRestriction(activity,"tables"),true);
 }
 assert.throws(()=>resolveActivityEntitlements("legacy-unknown",[]),/UNSUPPORTED_ACTIVITY_TYPE/);
});

test("automotive, carwash, salon and public works use service catalogs without dining features",()=>{
 for(const activity of ["automotive","carwash","salon","publicworks","laundry"]){
  for(const key of ["catalog","storefront","service_catalog","queue","payments","pos"])
   assert.equal(activityFeatureSupport(activity,key),"supported",activity+":"+key);
  for(const key of ["tables","split_bills","table_qr","room_service","digital_menu","department_printers"]){
   assert.equal(activityFeatureSupport(activity,key),"unsupported",activity+":"+key);
   assert.equal(passesServerActivityRestriction(activity,key),false,activity+":"+key);
  }
 }
 for(const key of ["inventory","purchases","suppliers","appointments"])
  assert.equal(activityFeatureSupport("automotive",key),"supported",key);
 for(const key of ["excise_tax","waitlist_fees","creator_profile"])
  assert.equal(activityFeatureSupport("automotive",key),"unsupported",key);
});
test("restaurant, cafe and grocery retain option variants without opening service variants",()=>{
 for(const activity of ["restaurant","cafe","grocery"]){
  assert.equal(activityFeatureSupport(activity,"variants"),"supported");
  assert.equal(passesServerActivityRestriction(activity,"variants"),true);
  assert.equal(canUseActivityFeature(activity,"variants",[{feature_key:"variants",enabled:true,limit_value:5}]),true);
  assert.equal(canUseActivityFeature(activity,"variants",[{feature_key:"variants",enabled:false,limit_value:null}]),false);
 }
 for(const activity of ["carwash","automotive","laundry","salon","publicworks"]){
  assert.equal(activityFeatureSupport(activity,"variants"),"unsupported");
  assert.equal(passesServerActivityRestriction(activity,"variants"),false);
 }
});
test("room service is enabled only for restaurants and cafes and still needs its plan grant",()=>{
 for(const activity of ["restaurant","cafe"]){assert.equal(activityFeatureSupport(activity,"room_service"),"supported");assert.equal(passesServerActivityRestriction(activity,"room_service"),true);assert.equal(canUseActivityFeature(activity,"room_service",[{feature_key:"room_service",enabled:true,limit_value:null}]),true);assert.equal(canUseActivityFeature(activity,"room_service",[{feature_key:"room_service",enabled:false,limit_value:null}]),false);}
 for(const activity of ["grocery","ecommerce","laundry","publicworks"])assert.equal(activityFeatureSupport(activity,"room_service"),"unsupported",activity);
});
test("service-order quotations are relevant only to service activities and still require grants",()=>{
 for(const activity of ["carwash","laundry","automotive","salon","publicworks"]){
  assert.equal(activityFeatureSupport(activity,"quotes"),"supported",activity);
  assert.equal(canUseActivityFeature(activity,"quotes",[{feature_key:"quotes",enabled:true,limit_value:null}]),true,activity);
  assert.equal(canUseActivityFeature(activity,"quotes",[{feature_key:"quotes",enabled:false,limit_value:null}]),false,activity);
 }
 for(const activity of ["grocery","clothing","ecommerce"]){
  assert.equal(activityFeatureSupport(activity,"quotes"),"unsupported",activity);
 }
});
test("all 15 activities share storefront and catalog limits without inheriting creator rights",()=>{
 for(const activity of Object.keys(ACTIVITY_PRESETS)){
  for(const key of ["catalog","storefront","qr_menu","customer_invoices"])
   assert.equal(activityFeatureSupport(activity,key),"supported",activity+":"+key);
  for(const key of ["creator_profile","media_library","content_marketplace"])
   assert.equal(activityFeatureSupport(activity,key),"unsupported",activity+":"+key);
 }
});
