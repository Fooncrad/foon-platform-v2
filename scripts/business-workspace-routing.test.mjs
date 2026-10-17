import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const presets=read("lib/platform/activity-presets.ts");
const activities=[...presets.matchAll(/^  ([a-z]+): \[/gm)].map(m=>m[1]);

test("each of 15 activities has its exact canonical identifier, not one store alias",()=>{
 assert.equal(activities.length,15);
 assert.equal(new Set(activities).size,15);
 for(const id of ["restaurant","cafe","sweets","grocery","clothing","perfume","accessories","watches","gifts","ecommerce","carwash","laundry","automotive","salon","publicworks"])
  assert.ok(activities.includes(id),id);
 const routes=read("lib/tenant/workspace-routes.ts");
 assert.match(routes,/isActivityType\(activity\)/);
 assert.match(routes,/return "\/workspace\/"\+activity/);
 assert.match(routes,/function activityPaymentsUrl/);
 assert.doesNotMatch(routes,/mysql2|@\/lib\/db\//,"client-shared helpers cannot import DB");
});

test("activity URL mismatch redirects after checking the user's tenant membership",()=>{
 const route=read("app/workspace/[activity]/page.tsx");
 assert.ok(route.indexOf("resolveWorkspace(userId,requested.tenant)")<route.indexOf("tenantWorkspaceActivity(workspace.tenant_id)"));
 assert.match(route,/activity!==actual\)redirect\(activityWorkspaceUrl\(actual,workspace.tenant_id\)\)/);
 assert.match(route,/if\(!isActivityType\(activity\)\)notFound\(\)/);
 const profile=read("lib/tenant/workspace-activity.ts");
 assert.match(profile,/WHERE t.id=\? AND t.status='active'/);
 assert.match(profile,/return rows\[0\].kind==="restaurant"\?"restaurant":null/);
});

test("account, new business signup and dashboard use activity_code, never store-kind bucket",()=>{
 const account=read("app/account/page.tsx");
 assert.match(account,/tenantWorkspaceActivity\(tenantId\)/);
 assert.match(account,/activityWorkspaceUrl\(activity,tenantId\)/);
 assert.doesNotMatch(account,/memberships\[0\]\.kind==="store"/);
 assert.match(read("app/restaurant/register/page.tsx"),/activityWorkspaceUrl\(activity,result.tenant.id\)/);
 const dash=read("app/restaurant/merchant-dashboard.tsx");
 assert.match(dash,/activityWorkspaceUrl\(data.activityCode,data.tenantId\)/);
 assert.match(dash,/activityPaymentsUrl\(data.activityCode,data.tenantId\)/);
});

test("legacy /business and restaurant links remain compatible without reassigning roles",()=>{
 const legacy=read("app/business/page.tsx");
 assert.match(legacy,/tenantWorkspaceActivity\(workspace.tenant_id\)/);
 assert.match(legacy,/redirect\(activityWorkspaceUrl\(activity,workspace.tenant_id\)\)/);
 const restaurant=read("app/restaurant/page.tsx");
 assert.match(restaurant,/resolveWorkspace\(userId,tenant\)/);
 assert.match(restaurant,/employee_permission_grants/);
 assert.match(restaurant,/employee_branch_assignments/);
 assert.match(restaurant,/kind==="restaurant"\?"restaurant":null/);
});

test("payment pages restrict activity route and use stored code for return link",()=>{
 const payments=read("app/workspace/[activity]/payments/page.tsx");
 assert.match(payments,/resolveWorkspace\(userId,requested.tenant\)/);
 assert.match(payments,/if\(activity!==actual\)redirect\(activityPaymentsUrl\(actual,workspace.tenant_id\)\)/);
 assert.match(read("app/restaurant/payments/page.tsx"),/activityWorkspaceUrl\(storedActivity,tenantId\)/);
});

test("database registration retains store-vs-restaurant bucket, not merchant-role equivalence",()=>{
 const original=read("app/api/auth/register/route.ts");
 assert.match(original,/restaurantActivities\.has\(activity\)\?"restaurant":"store"/);
 assert.match(read("app/api/restaurant/onboard/route.ts"),/\?"restaurant":"store"/);
});
