import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ACTIVITY_PRESETS} from "../lib/platform/activity-presets.ts";
import {localizedPlanNotice,localizedSubscriptionNotice} from "../lib/platform/plan-notices.ts";

const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const locales=["ar","en","fr"];

test("plan, subscription, feature-limit and employee-access notices are complete in all locales",()=>{
 for(const code of ["PLAN_FEATURE_REQUIRED","PLAN_LIMIT_REACHED","ACTIVITY_MODULE_UNAVAILABLE","NO_ACTIVE_SUBSCRIPTION","SUBSCRIPTION_PENDING","SUBSCRIPTION_EXPIRED","SUBSCRIPTION_CANCELLED","BRANCH_REQUIRED","STAFF_ACCESS_PENDING","STAFF_ACCESS_SUSPENDED"]){
  for(const locale of locales){
   const message=localizedPlanNotice(code,locale);
   assert.ok(message&&message.length>24,code+"/"+locale);
   if(locale==="ar")assert.match(message,/[\u0600-\u06FF]/u);
   else assert.doesNotMatch(message,/[\u0600-\u06FF]/u);
  }
 }
 assert.equal(localizedPlanNotice("UNKNOWN_CODE","en"),undefined);
  assert.match(localizedPlanNotice("PLAN_LIMIT_REACHED","en","Products"),/Products/);
  assert.match(localizedPlanNotice("PLAN_FEATURE_REQUIRED","fr","Commandes"),/Commandes/);
});

test("subscription notices distinguish owner guidance from employee-safe guidance",()=>{
 assert.equal(localizedSubscriptionNotice("active","ar"),undefined);
 assert.match(localizedSubscriptionNotice("expired","ar"),/انتهت مدة الاشتراك/);
 assert.match(localizedSubscriptionNotice("expired","en",true),/Contact the business owner/);
 assert.match(localizedSubscriptionNotice("pending","fr",true),/propriétaire ou le responsable/);
 const soon=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
 assert.match(localizedSubscriptionNotice("active","en",false,soon),/expires in/);
 assert.match(localizedSubscriptionNotice("active","fr",true,soon),/arrive bientôt à échéance/);
 assert.equal(localizedSubscriptionNotice("active","en",false,"2099-01-01"),undefined);
 assert.match(localizedSubscriptionNotice(undefined,"ar"),/لا يوجد اشتراك نشط/);
});

test("all 15 business activities retain activity-specific capability presets while plan notices remain common",()=>{
 assert.equal(Object.keys(ACTIVITY_PRESETS).length,15);
 for(const activity of Object.keys(ACTIVITY_PRESETS)){
  assert.ok(ACTIVITY_PRESETS[activity].length>0,activity);
  for(const locale of locales)assert.ok(localizedPlanNotice("PLAN_LIMIT_REACHED",locale));
 }
});

test("all activity workspace surfaces use the same localized plan messages and subscription notice",()=>{
 const resource=file("app/restaurant/resource-manager.tsx");
 const dashboard=file("app/restaurant/merchant-dashboard.tsx");
 const api=file("app/api/restaurant/operations/[module]/route.ts");
 assert.match(resource,/localizedPlanNotice\(key/);
 assert.match(dashboard,/localizedSubscriptionNotice\(data\.subscription\?\.status/);
 assert.match(dashboard,/aria-live="polite"/);
 assert.match(api,/localizedPlanNotice\(code,locale,featureLabel\)/);
});

test("tenant entitlement joins compare IDs and feature keys without MariaDB collation coercion",()=>{
 const source=file("lib/plans/entitlements.ts");
 for(const fragment of [
  "BINARY p.id=BINARY s.plan_id",
  "BINARY f.feature_key=BINARY ?",
  "BINARY pf.plan_id=BINARY p.id",
  "BINARY pf.feature_key=BINARY f.feature_key",
  "BINARY business.tenant_id=BINARY s.tenant_id",
  "BINARY af.activity_code=BINARY business.activity_code",
  "BINARY s.tenant_id=BINARY ?"
 ])assert.ok(source.includes(fragment),fragment);
});

test("restaurant workspace loading uses collation-independent comparisons for tenant, user, plan and feature IDs",()=>{
 const page=file("app/restaurant/page.tsx");
 for(const fragment of [
  "BINARY bp.tenant_id=BINARY t.id",
  "BINARY t.id=BINARY ?",
  "BINARY p.id=BINARY s.plan_id",
  "BINARY s.tenant_id=BINARY ?",
  "BINARY pf.plan_id=BINARY p.id",
  "BINARY pf.feature_key=BINARY f.feature_key",
  "BINARY bp.tenant_id=BINARY s.tenant_id",
  "BINARY af.activity_code=BINARY bp.activity_code",
  "BINARY t.id=BINARY m.tenant_id",
  "BINARY u.id=BINARY m.user_id",
  "BINARY m.user_id=BINARY ?",
  "BINARY a.branch_id=BINARY b.id"
 ])assert.ok(page.includes(fragment),fragment);
 const workspace=file("lib/tenant/workspace.ts");
 for(const fragment of [
  "BINARY t.id=BINARY m.tenant_id",
  "BINARY u.id=BINARY m.user_id",
  "BINARY m.user_id=BINARY ?"
 ])assert.ok(workspace.includes(fragment),fragment);
 const activity=file("lib/tenant/workspace-activity.ts");
 assert.ok(activity.includes("BINARY bp.tenant_id=BINARY t.id"));
 assert.ok(activity.includes("BINARY t.id=BINARY ?"));
 const authorization=file("lib/auth/authorization.ts");
 assert.ok(authorization.includes("BINARY user_id=BINARY ?"));
 assert.ok(authorization.includes("BINARY pa.user_id=BINARY ?"));
});
