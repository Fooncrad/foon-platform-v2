import test from "node:test";
import assert from "node:assert/strict";
import {ACTIVITY_PRESETS} from "../lib/platform/activity-presets.ts";
import {FREE_CATALOG_LIMIT,initialPlanFeatureLimit,shouldSeedFreeActivityDefaults} from "../lib/plans/free-plan-bootstrap-policy.ts";
test("free plan limits only product and service catalogs",()=>{
 assert.equal(FREE_CATALOG_LIMIT,20);
 for(const key of ["digital_menu","catalog"])
  assert.equal(initialPlanFeatureLimit("free",key),20);
 for(const feature of ["orders","employees","pos","storefront","delivery"])
  assert.equal(initialPlanFeatureLimit("free",feature),null,feature);
 for(const tier of ["starter","professional","enterprise"])
  for(const feature of ["catalog","digital_menu"])
   assert.equal(initialPlanFeatureLimit(tier,feature),null,tier+":"+feature);
});
test("initialization covers exactly the fifteen registered activities",()=>{
 const codes=Object.keys(ACTIVITY_PRESETS);
 assert.equal(codes.length,15);
 assert.equal(new Set(codes).size,15);
 for(const code of ["restaurant","cafe","automotive","salon","publicworks","watches","laundry","grocery"])
  assert.ok(codes.includes(code),code);
});
test("seed when free plan is created after migration 0093",()=>{
 assert.equal(shouldSeedFreeActivityDefaults(false,0,0),true);
});
test("seed an existing but entirely empty free plan once",()=>{
 assert.equal(shouldSeedFreeActivityDefaults(true,0,0),true);
});
test("a repeated bootstrap never recreates deliberately reset activity defaults",()=>{
 for(const [shared,overrides] of [[66,990],[66,989],[66,0],[0,10],[10,0]])
  assert.equal(shouldSeedFreeActivityDefaults(true,shared,overrides),false,String(shared)+":"+overrides);
});
test("reject invalid counts without deciding an unsafe seed",()=>{
 for(const value of [-1,1.2,NaN,Infinity]){
  assert.throws(()=>shouldSeedFreeActivityDefaults(true,value,0),/INVALID_FREE_PLAN_STATE/);
  assert.throws(()=>shouldSeedFreeActivityDefaults(true,0,value),/INVALID_FREE_PLAN_STATE/);
 }
});
