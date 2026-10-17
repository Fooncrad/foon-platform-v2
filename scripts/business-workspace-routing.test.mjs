import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("business route uses the same protected tenant-scoped workspace, not a second implementation",()=>{
 assert.match(read("app/business/page.tsx"),/export \{default\} from "\.\.\/restaurant\/page"/);
 assert.match(read("app/restaurant/page.tsx"),/resolveWorkspace\(userId,tenant\)/);
});
test("tenant kind, not role or route label, selects canonical account workspace",()=>{
 const account=read("app/account/page.tsx");
 assert.match(account,/SELECT m\.tenant_id,t\.kind FROM memberships/);
 assert.match(account,/memberships\[0\]\.kind==="store"\?"\/business":"\/restaurant"/);
});
test("service and retail onboarding no longer redirect to restaurant workspace URL",()=>{
 const register=read("app/restaurant/register/page.tsx");
 assert.match(register,/\["restaurant","cafe","sweets"\]\.includes\(activity\)\?"\/restaurant":"\/business"/);
});
test("business owners and staff retain shared role permissions and scoped dashboard navigation",()=>{
 const dash=read("app/restaurant/merchant-dashboard.tsx");
 assert.match(dash,/includes\(data\.activityCode\)\?"\/restaurant":"\/business"/);
 assert.match(dash,/data\.tenantId/);
 assert.match(read("app/restaurant/page.tsx"),/employee_permission_grants/);
 assert.match(read("app/restaurant/page.tsx"),/employee_branch_assignments/);
});
test("database merchant kind remains distinct and existing routes continue working",()=>{
 const original=read("app/api/auth/register/route.ts");
 assert.match(original,/restaurantActivities\.has\(activity\)\?"restaurant":"store"/);
 assert.match(read("app/api/restaurant/onboard/route.ts"),/\?"restaurant":"store"/);
 assert.match(read("app/restaurant/page.tsx"),/export default async function RestaurantPage/);
});
