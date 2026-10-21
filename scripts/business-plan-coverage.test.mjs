import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {referenceFeatures} from "../lib/plans/reference-catalog.ts";
import {ACTIVITY_PRESETS} from "../lib/platform/activity-presets.ts";
import {activityFeatureSupport,passesServerActivityRestriction} from "../lib/platform/activity-plan-entitlements.ts";
import {resourceModules} from "./restaurant-resource-schema.mjs";

const source=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const migration=source("../migrations/0106_business_feature_grants.sql");
const creatorOnly=new Set(["creator_profile","content_marketplace","media_library","watermark","content_pricing"]);
const catalogKeys=referenceFeatures.map(([key])=>key);

test("business migration registers the entire current reference catalog, no silent omissions",()=>{
 const definitions=migration.split("INSERT IGNORE INTO package_plan_features")[0];
 const keys=[...definitions.matchAll(/\(\s*'([^']+)'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'boolean'\s*\)/g)].map(match=>match[1]);
 assert.deepEqual(new Set(keys),new Set(catalogKeys));
 assert.equal(keys.length,new Set(keys).size,"no duplicate feature definitions");
 const grants=migration.match(/JOIN package_features f ON f\.feature_key IN\s*\(([\s\S]*?)\)/);
 assert.ok(grants,"migration must use an explicit allowlist, not arbitrary admin-created keys");
 const enabledKeys=[...grants[1].matchAll(/'([^']+)'/g)].map(match=>match[1]);
 assert.equal(enabledKeys.length,new Set(enabledKeys).size);
 assert.deepEqual(new Set(enabledKeys),new Set(catalogKeys.filter(key=>!creatorOnly.has(key))));
 assert.match(migration,/INSERT IGNORE INTO package_plan_features/);
 assert.match(migration,/WHERE p\.code='enterprise'/);
 assert.equal(enabledKeys.length,62);
});

test("business grants cannot bypass server activity restrictions or create employee/creator roles",()=>{
 for(const activity of Object.keys(ACTIVITY_PRESETS)){
  for(const feature of creatorOnly){
   assert.equal(activityFeatureSupport(activity,feature),"unsupported",activity+":"+feature);
   assert.equal(passesServerActivityRestriction(activity,feature),false,activity+":"+feature);
  }
  assert.equal(activityFeatureSupport(activity,"pos"),"supported",activity);
 }
 for(const [module,config] of Object.entries(resourceModules)){
  if(config.feature)assert.ok(catalogKeys.includes(config.feature),module+" has no registered plan feature");
 }
});

test("Business entitlement is denied without a stored shared/activity grant",()=>{
 const backend=source("../lib/plans/entitlements.ts");
 const admin=source("../app/api/admin/plans/[id]/features/route.ts");
 assert.match(backend,/const enabled=Boolean\(rows\[0\]\.enabled\)/);
 assert.doesNotMatch(backend,/rows\[0\]\.plan_code==="enterprise"/);
 assert.match(admin,/COALESCE\(af\.enabled,pf\.enabled,0\) AS enabled/);
 assert.doesNotMatch(admin,/CASE WHEN p\.code='enterprise' THEN 1 ELSE 0 END/);
});

test("new paid plan bootstrap excludes creator-only features from merchant plans",()=>{
 const sourceText=source("../app/api/admin/plans/bootstrap/route.ts");
 assert.match(sourceText,/!merchantExcluded\.has\(key\)/);
 for(const key of creatorOnly)assert.ok(sourceText.includes('"'+key+'"'));
});
