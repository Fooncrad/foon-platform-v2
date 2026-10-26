import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");test("floor page has top plan tabs, compact header and section waiter panel",()=>{const ui=read("app/restaurant/section-floor-layouts.tsx"),css=read("app/restaurant/section-floor-layouts.css");for(const s of ["foonFloorPlanTabs","SectionStaffPanel","openLayout(l.id)"])assert.ok(ui.includes(s),s);assert.match(css,/\.foonFloorPlanTabs/);assert.match(css,/\.foonFloorTitle\{margin:0 0 8px/)});test("staff assignments are branch scoped and writable only by owner/manager",()=>{const api=read("app/api/restaurant/section-staff/route.ts");for(const s of ["requireTenantMembership","requireAllAdditionalBranchesUnlocked","DUPLICATE_ASSIGNMENT","STAFF_NOT_AUTHORIZED"])assert.ok(api.includes(s),s)});test("host state change alert is persisted with operational update",()=>{assert.match(read("app/api/restaurant/floor-plan-layouts/route.ts"),/INSERT INTO restaurant_section_host_alerts/);assert.match(read("migrations/0309_restaurant_section_staff_alerts.sql"),/CREATE TABLE IF NOT EXISTS restaurant_section_staff_assignments/)})
test("non-owner section access requires an enabled assignment to the requested branch",()=>{
 const api=read("app/api/restaurant/section-staff/route.ts");
 assert.match(api,/if\(m\.role!=="owner"\)/);
 assert.match(api,/SELECT 1 FROM employee_branch_assignments WHERE tenant_id=\? AND branch_id=\? AND user_id=\? AND enabled=TRUE LIMIT 1/);
 assert.match(api,/if\(!assigned\.length\)return \{error:NextResponse\.json\(\{ok:false,code:"FORBIDDEN"\},\{status:403\}\)\}/);
});
test("section staff listings and assignment writes reject inactive or other-branch staff",()=>{
 const api=read("app/api/restaurant/section-staff/route.ts");
 assert.equal((api.match(/a\.branch_id=\? AND a\.enabled=TRUE/g)??[]).length,2);
 assert.equal((api.match(/m\.role='owner' OR a\.user_id IS NOT NULL/g)??[]).length,2);
 assert.equal((api.match(/JOIN users u ON u\.id=m\.user_id AND u\.status='active'/g)??[]).length,2);
});
