import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {ACTIVITY_PRESETS} from "../lib/platform/activity-presets.ts";
import {activityFeatureSupport,canUseActivityFeature,passesServerActivityRestriction} from "../lib/platform/activity-plan-entitlements.ts";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("display advertising is shared across every activity but still needs its exact plan grant",()=>{
 const grant=[{feature_key:"display_advertising",enabled:true,limit_value:null}];
 for(const activity of Object.keys(ACTIVITY_PRESETS)){
  assert.equal(activityFeatureSupport(activity,"display_advertising"),"supported",activity);
  assert.equal(passesServerActivityRestriction(activity,"display_advertising"),true,activity);
  assert.equal(canUseActivityFeature(activity,"display_advertising",grant),true,activity);
  assert.equal(canUseActivityFeature(activity,"display_advertising",[{...grant[0],enabled:false}]),false,activity);
  assert.equal(canUseActivityFeature(activity,"display_advertising",[]),false,activity);
 }
});

test("display advertising is registered, granted to Business, and enforced independently from campaigns",async()=>{
 const catalog=await read("lib/plans/reference-catalog.ts");
 const migration=await read("migrations/0156_display_advertising_entitlement.sql");
 const businessActivityGrant=await read("migrations/0162_display_advertising_business_activity_grants.sql");
 const api=await read("app/api/restaurant/displays/route.ts");
 const page=await read("app/restaurant/displays/page.tsx");
 const assets=await read("app/api/restaurant/assets/route.ts");
 assert.match(catalog,/display_advertising/);
 assert.match(migration,/p\.code='enterprise'/);
 assert.match(migration,/INSERT IGNORE INTO package_plan_features/);
 assert.match(businessActivityGrant,/p\.code='enterprise'/);
 assert.match(businessActivityGrant,/INSERT INTO package_plan_activity_features/);
 for(const activity of Object.keys(ACTIVITY_PRESETS))assert.ok(businessActivityGrant.includes("SELECT '"+activity+"'"),"Missing Enterprise grant for "+activity);
 assert.match(api,/tenantEntitlement\(tenant,"display_advertising"\)/);
 assert.doesNotMatch(api,/tenantEntitlement\(tenant,"campaigns"\)/);
 assert.match(page,/tenantEntitlement\(workspace\.tenant_id,"display_advertising"\)/);
 assert.match(assets,/tenantEntitlement\(tenant,'display_advertising'\)/);
});

test("all merchant activity dashboards expose the shared display section only to managers",async()=>{
 const dashboard=await read("app/restaurant/merchant-dashboard.tsx");
 const navigation=await read("lib/ux/merchant-navigation.ts");
 const routes=await read("lib/tenant/workspace-routes.ts");
 assert.match(dashboard,/key:"displays",label:"إعلانات الشاشات",icon:"dashboard",feature:"display_advertising",roles:\["owner","manager"\]/);
 assert.match(dashboard,/active==="displays"\?<DisplayManager/);
 assert.match(navigation,/displays:"growth"/);
 assert.match(routes,/section==="displays"\?path\+"\?section=displays"/);
});
