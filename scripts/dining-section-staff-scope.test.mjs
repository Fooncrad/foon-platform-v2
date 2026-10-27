import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../lib/restaurant/dining.ts",import.meta.url),"utf8");
const sql=source.match(/"SELECT r\.id FROM restaurant_resources r JOIN memberships m ON [^"\n]+ LOCK IN SHARE MODE"/)?.[0];
assert.ok(sql,"section staff membership query must exist");

test("section staff query scopes tenant, branch, resource and locks",()=>{
 for(const fragment of ["m.tenant_id=r.tenant_id","a.tenant_id=r.tenant_id","a.branch_id=?","r.tenant_id=?","r.id=?","r.branch_id=?","r.kind='employee'","r.archived=FALSE","r.status='active'","LOCK IN SHARE MODE"])
  assert.ok(sql.includes(fragment),fragment);
 assert.equal((sql.match(/\?/g)||[]).length,6,"six bound parameters expected");
 assert.ok(source.includes("[role,input.branchId,tenant,d[key],input.branchId,expectedRole]"),"membership role must be bound from the role mapping");
});
test("section staff query requires active account and role-matched branch assignment",()=>{
 for(const fragment of ["JOIN users u ON u.id=m.user_id AND u.status='active'","m.status='active'","m.role=?","a.enabled=TRUE","a.role COLLATE utf8mb4_unicode_ci=m.role COLLATE utf8mb4_unicode_ci"])
  assert.ok(sql.includes(fragment),fragment);
 assert.ok(!sql.includes("m.role='waiter'"),"supervisors must not be forced into waiter membership");
});
test("section staff cannot use customer or platform admin identities",()=>{
 for(const fragment of ["NOT EXISTS (SELECT 1 FROM memberships customer","customer.role='customer'","customer.status='active'","NOT EXISTS (SELECT 1 FROM tenant_customers tc","NOT EXISTS (SELECT 1 FROM platform_admins pa"])
  assert.ok(sql.includes(fragment),fragment);
});
test("waiters and supervisors require their corresponding membership and resource roles",()=>{
 assert.ok(source.includes("[['waiterId','waiter'],['supervisorId','manager']]"));
 assert.ok(source.includes("key==='waiterId'?'waiter':'supervisor'"));
 assert.ok(sql.includes("JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.role'))=?"));
 assert.ok(sql.includes("m.role=?"));
 assert.ok(sql.includes("a.role COLLATE utf8mb4_unicode_ci=m.role COLLATE utf8mb4_unicode_ci"));
 assert.ok(source.includes("[role,input.branchId,tenant,d[key],input.branchId,expectedRole]"));
});

test("mixed MariaDB 11.8 role collations are normalized for the authorization comparison",()=>{
 assert.ok(sql.includes("a.role COLLATE utf8mb4_unicode_ci=m.role COLLATE utf8mb4_unicode_ci"));
 assert.ok(!sql.includes("a.role=m.role"),"implicit collation comparison is unsafe");
});
