import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("admin access resolves the target tenant activity rather than forcing a restaurant",()=>{
 const route=read("app/api/admin/tenants/[id]/access/route.ts");
 assert.match(route,/tenantWorkspaceActivity\(id\)/);
 assert.match(route,/activityWorkspaceUrl\(activity,id\)/);
 assert.doesNotMatch(route,/url:"\/restaurant\?tenant="/);
 assert.match(route,/platform_tenant_support_sessions/);
 assert.match(route,/platform_audit_events/);
});
test("admin tenant access still requires scoped, expiring audit session",()=>{
 const guard=read("lib/auth/authorization.ts");
 assert.match(guard,/s\.tenant_id=\?/);
 assert.match(guard,/s\.auth_session_id=\?/);
 assert.match(guard,/s\.expires_at>UTC_TIMESTAMP\(\)/);
 assert.match(guard,/role==="support"/);
});
