import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const employee=read("app/api/restaurant/employee-provision/route.ts");
const dining=read("lib/restaurant/dining.ts");
const restaurant=read("app/restaurant/page.tsx");

test("employee account fallback compares role columns with explicit matching collations",()=>{
 assert.match(employee,/a\.role COLLATE utf8mb4_unicode_ci=m\.role COLLATE utf8mb4_unicode_ci/);
 assert.doesNotMatch(employee,/a\.role=m\.role/);
});

test("dining staff assignment compares role columns explicitly and preserves branch scoping",()=>{
 assert.match(dining,/a\.role COLLATE utf8mb4_unicode_ci=m\.role COLLATE utf8mb4_unicode_ci/);
 assert.match(dining,/a\.branch_id=\?/);
 assert.match(dining,/r\.tenant_id=\?/);
});

test("restaurant workspace joins normalize potentially mixed-collation text keys",()=>{
 for(const fragment of [
  "bp.tenant_id COLLATE utf8mb4_unicode_ci=t.id COLLATE utf8mb4_unicode_ci",
  "p.id COLLATE utf8mb4_unicode_ci=s.plan_id COLLATE utf8mb4_unicode_ci",
  "pf.feature_key COLLATE utf8mb4_unicode_ci=f.feature_key COLLATE utf8mb4_unicode_ci",
  "af.feature_key COLLATE utf8mb4_unicode_ci=f.feature_key COLLATE utf8mb4_unicode_ci",
  "af.activity_code COLLATE utf8mb4_unicode_ci=bp.activity_code COLLATE utf8mb4_unicode_ci",
  "t.id COLLATE utf8mb4_unicode_ci=m.tenant_id COLLATE utf8mb4_unicode_ci",
  "u.id COLLATE utf8mb4_unicode_ci=m.user_id COLLATE utf8mb4_unicode_ci",
  "b.id COLLATE utf8mb4_unicode_ci=a.branch_id COLLATE utf8mb4_unicode_ci"
 ]) assert.ok(restaurant.includes(fragment),fragment);
});
