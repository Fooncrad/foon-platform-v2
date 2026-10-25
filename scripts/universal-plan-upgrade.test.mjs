import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ACTIVITY_PRESETS} from "../lib/platform/activity-presets.ts";
import {activitySectionUrl} from "../lib/tenant/workspace-routes.ts";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("each of the fifteen business activities has an owner plan-upgrade route",()=>{
 const activities=Object.keys(ACTIVITY_PRESETS);
 assert.equal(activities.length,15);
 for(const activity of activities){
  const url=activitySectionUrl(activity,"subscription");
  assert.match(url,/^\/[a-z-]+\/subscription$/);
 }
 const dashboard=read("app/restaurant/merchant-dashboard.tsx");
 assert.match(dashboard,/active==="subscription"/);
 assert.match(dashboard,/MerchantSubscriptionRequest tenantId=\{data\.tenantId\}/);
 assert.match(dashboard,/data\.role==="owner"&&!data\.supportReadOnly&&!data\.adminAccess/);
 assert.match(dashboard,/activitySectionUrl\(data\.activityCode,"subscription"\)/);
});

test("category and item entitlement blocks provide a recovery path in every editor",()=>{
 const notice=read("app/restaurant/plan-upgrade-notice.tsx");
 for(const code of ["PLAN_LIMIT_REACHED","PLAN_FEATURE_REQUIRED"])
  assert.ok(notice.includes(code));
 assert.match(notice,/activitySectionUrl\(activity,"subscription"\)/);
 for(const path of ["app/restaurant/activity-catalog-editor.tsx","app/restaurant/menu/category-editor.tsx","app/restaurant/resource-manager.tsx","app/restaurant/menu/bulk-import.tsx"]){
  const content=read(path);
  assert.ok(content.includes("PlanUpgradeNotice"),path);
 }
 const importer=read("app/restaurant/menu/bulk-import.tsx");
 assert.match(importer,/isUpgradeError\(result\.code\)/);
 assert.match(importer,/context='import'/);
 const editor=read("app/restaurant/activity-catalog-editor.tsx");
 assert.equal((editor.match(/activity=\{activityCode\?\?"restaurant"\} kind=/g)||[]).length,4);
});

test("upgrade choices display genuine activity-specific plan grants and present correct quota",()=>{
 const api=read("app/api/tenant/subscription-requests/route.ts");
 for(const term of ["tenantEntitlement","restaurant_menu_categories","catalog_categories","package_plan_activity_features","package_plan_prices","catalog_limit","catalog_enabled","quota:{used:"])
  assert.ok(api.includes(term),term);
 assert.match(api,/featureKey=\["carwash","automotive","laundry","salon","publicworks"\]/);
 assert.match(api,/requireTenantMembership\(user,id,\["owner"\]/);
 assert.match(api,/status:'pending'|status:"pending"|status=\x27pending\x27/);
 const ui=read("app/restaurant/payments/merchant-subscription-request.tsx");
 for(const term of ["availablePlans","catalog_limit","catalog_enabled","quota.used","atLimit","pending","/contact","MerchantSubscriptionRequest"])
  if(term!=="MerchantSubscriptionRequest")assert.ok(ui.includes(term),term);
 assert.match(ui,/availablePlans\.map\(p=>/);
 assert.match(ui,/prices\.filter\(p=>!atLimit\|\|expandsLimit\(p\)\)/);
});

test("paid upgrades still require manual admin approval and never bypass an entitlement check",()=>{
 const server=read("app/api/tenant/subscription-requests/route.ts");
 assert.match(server,/INSERT INTO platform_payment_requests/);
 assert.match(server,/PAYMENT_ALREADY_PENDING/);
 assert.match(server,/pr\.enabled=TRUE/);
 assert.match(server,/pp\.code<>'free'/);
 assert.doesNotMatch(server,/UPDATE tenant_subscriptions SET/);
 const cap=read("lib/plans/catalog-capacity.ts");
 assert.match(cap,/PLAN_LIMIT_REACHED/);
 assert.match(cap,/assertCatalogCapacity/);
});
