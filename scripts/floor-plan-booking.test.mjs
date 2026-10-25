import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("floor plan is scoped to branch and tenant and requires authorized writes",()=>{
 const api=read("app/api/restaurant/floor-plan/route.ts");
 assert.match(api,/requireTenantMembership/);
 assert.match(api,/requireAllAdditionalBranchesUnlocked/);
 assert.match(api,/branch_id/);
 assert.match(api,/assertSameOrigin/);
});
test("floor plan is embedded in tables management without replacing reservation engine",()=>{
 const dashboard=read("app/restaurant/merchant-dashboard.tsx");
 assert.match(dashboard,/active==="tables"\?<><RestaurantFloorPlan/);
 assert.match(dashboard,/<ServiceWorkspace key=\{active/);
});
test("floor plan migration and validation bound layout size and entries",()=>{
 const sql=read("migrations/0304_restaurant_floor_plans.sql");
 assert.match(sql,/PRIMARY KEY\(tenant_id,branch_id\)/);
 const validate=read("lib/restaurant/floor-plan.ts");
 assert.match(validate,/p.tables.length>500/);
 assert.match(validate,/ids.has\(t.id\)/);
});
