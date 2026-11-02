import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {restrictedMembershipReason} from "../lib/auth/account-login-policy.ts";

const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("inactive employee memberships never fall through to customer access",()=>{
 assert.equal(restrictedMembershipReason([{role:"waiter",membership_status:"invited",tenant_status:"active"}]),"STAFF_ACCESS_PENDING");
 assert.equal(restrictedMembershipReason([{role:"cashier",membership_status:"suspended",tenant_status:"active"}]),"STAFF_ACCESS_SUSPENDED");
 assert.equal(restrictedMembershipReason([{role:"owner",membership_status:"invited",tenant_status:"active"}]),"BUSINESS_PENDING");
 assert.equal(restrictedMembershipReason([{role:"waiter",membership_status:"active",tenant_status:"active"}]),null);
});

test("employee login membership joins are independent of MariaDB text collations",()=>{
 const source=file("lib/auth/account-login-policy.ts");
 assert.match(source,/BINARY t\.id=BINARY m\.tenant_id/);
 assert.match(source,/BINARY m\.user_id=BINARY \?/);
});

test("login UI explains employee pending and suspended states in the selected language",()=>{
 const page=file("app/login/page.tsx");
 assert.match(page,/localizedPlanNotice\(String\(body\.code\),lang\)/);
 assert.match(page,/STAFF_ACCESS_PENDING/);
 assert.match(page,/STAFF_ACCESS_SUSPENDED/);
 assert.match(page,/Reference: /);
 assert.match(page,/Référence : /);
});

test("login server logs only a stage and safe incident reference for unexpected failures",()=>{
 const route=file("app/api/auth/login/route.ts");
 assert.match(route,/stage="membership_policy"/);
 assert.match(route,/stage="session_create"/);
 assert.match(route,/logIncident\(\{incidentId,code:"LOGIN_UNAVAILABLE",location:"auth\.login\."+stage,error\}\)/);
 assert.match(route,/X-Foon-Incident-Id/);
 assert.doesNotMatch(route,/console\.(log|error)\([^\n]*email/);
});
