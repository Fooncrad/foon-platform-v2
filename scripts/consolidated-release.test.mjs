import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("financial and delivery migrations occupy unique sequence numbers",()=>{
 const files=readdirSync(new URL("../migrations/",import.meta.url)).filter(x=>/^015[2-5]_.*\.sql$/.test(x)).sort();
 assert.deepEqual(files,["0152_creator_subscription_referrals.sql","0153_platform_payment_transfer_evidence.sql","0154_platform_approved_transfer_claims.sql","0155_branch_delivery_locations.sql"]);
});
test("saved address lookup stays tenant and country scoped",()=>{
 const source=read("app/api/customer/delivery-preferences/route.ts");
 assert.match(source,/countries\.length\?await db\.execute/);
 assert.match(source,/employeePersonalAccessDenied/);
 assert.match(source,/JOIN tenant_customers c ON c\.tenant_id=t\.id AND c\.user_id=\?/);
});
test("branch positions need owner or manager and branch PIN",()=>{
 const s=read("app/api/restaurant/branch-delivery-locations/route.ts");
 assert.match(s,/requireTenantMembership\(user,tenant,\["owner","manager"\]\)/);
 assert.match(s,/requireAdditionalBranchUnlock\(tenant,body\.branchId,user\)/);
 assert.match(s,/enabled=TRUE/);
});
test("navigation retains grants and offers email verification",()=>{
 const s=read("app/restaurant/merchant-dashboard.tsx");
 assert.match(s,/groupVisibleMerchantSections/);
 assert.match(s,/EmailVerificationNotice language=\{uiLanguage\}/);
 assert.doesNotMatch(s,/collapsedNavGroups|restaurantNavChevron|restaurantNavGroupCount/);
});
