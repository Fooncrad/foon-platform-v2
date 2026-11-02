import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("staff RBAC rejects ungranted actions and forbids privileged role aliases",()=>{
 const api=read("app/api/restaurant/operations/[module]/route.ts");
 const dashboard=read("app/restaurant/merchant-dashboard.tsx");
 assert.match(api,/if\(!grants\.length\)throw new ResourceError\("FORBIDDEN"\)/);
 assert.match(api,/if\(exact\.some\(g=>Number\(g\.allowed\)===0\)\)throw new ResourceError/);
 assert.match(api,/employee_branch_assignments/);
 assert.match(api,/authorizedBranch/);
 assert.match(dashboard,/data\.staffPermissions/);
 assert.match(dashboard,/allowedSection=/);
 assert.match(dashboard,/sectionPolicy\?\.roles\.includes\(data\.role\)/);
});

test("employee accounts are provisioned only by explicit password and branch",()=>{
 const provision=read("app/api/restaurant/employee-provision/route.ts");
 const resources=read("lib/restaurant/operations.ts");
 const invite=read("app/api/employee-invite/route.ts");
 const tenantInvite=read("app/api/restaurant/employee-invite/route.ts");
 for(const s of [invite,tenantInvite])assert.match(s,/EMPLOYEE_INVITATIONS_DISABLED/);
 assert.match(provision,/hashPassword\(password\)/);
 assert.match(provision,/employee\.branch_id/);
 assert.match(provision,/ACCOUNT_ALREADY_EXISTS/);
 assert.match(provision,/employee\.password_reset/);
 assert.match(provision,/DELETE FROM auth_sessions WHERE user_id=\?/);
 assert.match(resources,/EMPLOYEE_MANAGER_ROLE_PROTECTED/);
 assert.match(resources,/EMPLOYEE_ACCOUNT_IMMUTABLE/);
});

test("branch PIN is salted, session-scoped and throttled",()=>{
 const core=read("lib/restaurant/branch-pin.ts");
 const unlock=read("app/api/restaurant/branches/unlock/route.ts");
 const sql=read("migrations/0150_additional_branch_pin.sql");
 assert.match(core,/scryptSync/);
 assert.match(core,/timingSafeEqual/);
 assert.match(core,/currentSessionId/);
 assert.match(core,/unlocked_until>UTC_TIMESTAMP/);
 assert.match(core,/onlyUnlockedBranchRows/);
 assert.match(core,/requireAllAdditionalBranchesUnlocked/);
 assert.match(unlock,/next>=5/);
 assert.match(unlock,/15\*60\*1000/);
 assert.match(unlock,/assertSameOrigin\(request\)/);
 assert.match(sql,/pin_hash/);
 assert.match(sql,/PRIMARY KEY\(auth_session_id,branch_id\)/);
});

test("sensitive independent branch endpoints enforce PIN on writes and reads",()=>{
 const paths=[
  "app/api/restaurant/receipts/route.ts",
  "app/api/restaurant/staff-help/route.ts",
  "app/api/restaurant/service-requests/route.ts",
  "app/api/restaurant/assigned-service/route.ts",
  "app/api/restaurant/payments/service-checkout/route.ts",
  "app/api/restaurant/payments/refund-reviews/route.ts"
 ];
 for(const path of paths){
  const s=read(path);
  assert.match(s,/requireAdditionalBranchUnlock|onlyUnlockedBranchRows/,path);
  assert.match(s,/tenant_id=\?|tenantId/,path);
 }
});
test("tenant-wide mutating APIs require all branch PIN unlocks",()=>{
 const paths=[
  "app/api/restaurant/activity-catalog/route.ts",
  "app/api/restaurant/activity-catalog/options/route.ts",
  "app/api/restaurant/activity-catalog/images/route.ts",
  "app/api/restaurant/activity-catalog/variant-images/route.ts",
  "app/api/restaurant/catalog-import/route.ts",
  "app/api/restaurant/assets/route.ts",
  "app/api/restaurant/menu/categories/route.ts",
  "app/api/restaurant/menu/items/route.ts",
  "app/api/restaurant/menu/appearance/route.ts",
  "app/api/restaurant/activity-template/route.ts",
  "app/api/restaurant/international-shipping/route.ts",
  "app/api/restaurant/mail-settings/route.ts",
  "app/api/restaurant/payments/settings/route.ts",
  "app/api/restaurant/public-controls/route.ts",
  "app/api/restaurant/location-settings/route.ts"
 ];
 for(const path of paths)assert.match(read(path),/requireAllAdditionalBranchesUnlocked/,path);
});
test("system health geocoding readiness property matches UI type",()=>{
 const view=read("app/restaurant/service-workspace.tsx");
 const api=read("app/api/restaurant/operations/[module]/route.ts");
 assert.match(view,/geocodingConfigured\?:boolean/);
 assert.match(api,/geocodingConfigured:Boolean\(process\.env\.GOOGLE_MAPS_GEOCODING_API_KEY\)/);
});
