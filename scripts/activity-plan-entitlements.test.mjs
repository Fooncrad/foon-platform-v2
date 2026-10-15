import {ACTIVITY_PRESETS} from "../lib/platform/activity-presets.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {resolveActivityEntitlements,canUseActivityFeature,activityFeatureCapability,activityFeatureSupport} from "../lib/platform/activity-plan-entitlements.ts";

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
   const expected=ACTIVITY_PRESETS[activity].includes(activityFeatureCapability(key));
   assert.equal(activityFeatureSupport(activity,key),expected?"supported":"unsupported");
   assert.equal(canUseActivityFeature(activity,key,[{feature_key:key,enabled:true,limit_value:null}]),expected);
  }
  assert.equal(activityFeatureSupport(activity,"future_feature"),"unclassified");
 }
 assert.throws(()=>activityFeatureSupport("unknown","pos"),/UNSUPPORTED_ACTIVITY_TYPE/);
});
