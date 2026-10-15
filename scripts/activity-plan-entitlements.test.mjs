import {ACTIVITY_PRESETS} from "../lib/platform/activity-presets.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {resolveActivityEntitlements,canUseActivityFeature} from "../lib/platform/activity-plan-entitlements.ts";

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
