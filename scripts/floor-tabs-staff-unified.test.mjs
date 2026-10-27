import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");test("floor page has top plan tabs, compact header and section waiter panel",()=>{const ui=read("app/restaurant/section-floor-layouts.tsx"),css=read("app/restaurant/section-floor-layouts.css");for(const s of ["foonFloorPlanTabs","SectionStaffPanel","openLayout(layout.id)"])assert.ok(ui.includes(s),s);assert.match(css,/\.foonFloorPlanTabs/);assert.match(css,/\.foonFloorTitle\{margin:0 0 8px/)});test("staff assignments are branch scoped and writable only by owner/manager",()=>{const api=read("app/api/restaurant/section-staff/route.ts");for(const s of ["requireTenantMembership","requireAdditionalBranchUnlock","DUPLICATE_ASSIGNMENT","STAFF_NOT_AUTHORIZED"])assert.ok(api.includes(s),s)});test("host state change alert is persisted with operational update",()=>{assert.match(read("app/api/restaurant/floor-plan-layouts/route.ts"),/INSERT INTO restaurant_section_host_alerts/);assert.match(read("migrations/0309_restaurant_section_staff_alerts.sql"),/CREATE TABLE IF NOT EXISTS restaurant_section_staff_assignments/)})
test("non-owner section access requires an enabled assignment to the requested branch",()=>{
 const api=read("app/api/restaurant/section-staff/route.ts");
 assert.match(api,/if\(m\.role!=="owner"\)/);
 assert.match(api,/SELECT 1 FROM employee_branch_assignments WHERE tenant_id=\? AND branch_id=\? AND user_id=\? AND enabled=TRUE AND role COLLATE utf8mb4_unicode_ci=\? LIMIT 1/);
 assert.match(api,/if\(!assigned\.length\)return \{error:NextResponse\.json\(\{ok:false,code:"FORBIDDEN"\},\{status:403\}\)\}/);
});
test("section staff access, listing and assignment writes require branch role to match membership role",()=>{
 const api=read("app/api/restaurant/section-staff/route.ts");
 assert.match(api,/\[m\.tenantId,branch,uid,m\.role\]/);
 assert.equal((api.match(/a\.role COLLATE utf8mb4_unicode_ci=m\.role COLLATE utf8mb4_unicode_ci/g)??[]).length,2);
 assert.match(api,/m\.role!==\"owner\"/);
});

test("section staff listings and assignment writes reject inactive or other-branch staff",()=>{
 const api=read("app/api/restaurant/section-staff/route.ts");
 assert.equal((api.match(/a\.branch_id=\? AND a\.enabled=TRUE/g)??[]).length,2);
 assert.equal((api.match(/m\.role='owner' OR a\.user_id IS NOT NULL/g)??[]).length,2);
 assert.equal((api.match(/JOIN users u ON u\.id=m\.user_id AND u\.status='active'/g)??[]).length,2);
});

test("oversized section staff writes are rejected with HTTP 413",()=>{
 const api=read("app/api/restaurant/section-staff/route.ts");
 assert.match(api,/readLimitedJson\(req,8192\)/);
 assert.match(api,/error\.message==="BATCH_TOO_LARGE"/);
 assert.match(api,/status:tooLarge\?413:400/);
});

test("section staff reads and writes require only the selected branch PIN",()=>{
 const api=read("app/api/restaurant/section-staff/route.ts");
 assert.match(api,/await requireAdditionalBranchUnlock\(m\.tenantId,branch,uid\)/);
 assert.doesNotMatch(api,/requireAllAdditionalBranchesUnlocked/);
});

test("waiter section staff view is read-only and manager save is capability gated",()=>{
 const api=read("app/api/restaurant/section-staff/route.ts");
 const ui=read("app/restaurant/section-staff-panel.tsx");
 assert.match(api,/canManage:c\.manager/);
 assert.match(ui,/setCanManage\(Boolean\(data\.canManage\)\)/);
 assert.match(ui,/\{canManage\?<button/);
 assert.match(ui,/Assignments are read-only/);
});

test("floor-plan reads retain the selected-branch PIN gate when section staffing lands",()=>{
 const api=read("app/api/restaurant/floor-plan-layouts/route.ts");
 assert.match(api,/BranchPinError,requireAdditionalBranchUnlock,requireAllAdditionalBranchesUnlocked/);
 assert.match(api,/if\(!write&&\(!membership\.adminAccess\|\|membership\.platformRole==="support"\)\)await requireAdditionalBranchUnlock\(membership\.tenantId,branch,user\)/);
 assert.match(api,/error instanceof BranchPinError\?error\.code:"FORBIDDEN"/);
});

test("floor-plan selectors exclude inactive dining sections",()=>{
 const api=read("app/api/restaurant/floor-plan-layouts/route.ts");
 const query="kind='dining_section' AND archived=FALSE AND status='active' AND (branch_id=? OR branch_id IS NULL) ORDER BY name LIMIT 200";
 assert.equal(api.split(query).length-1,2,"both section list endpoints must show active sections only");
});

test("section alert timestamps use the selected Arabic, English, or French locale",()=>{
 const ui=read("app/restaurant/section-staff-panel.tsx");
 assert.match(ui,/language==="ar"\?"ar-SA":language==="fr"\?"fr-FR":"en-GB"/);
 assert.match(ui,/numberingSystem:"latn"/);
});

test("host alerts display the visible table number instead of the internal layout ID",()=>{
 const api=read("app/api/restaurant/section-staff/route.ts");
 const ui=read("app/restaurant/section-staff-panel.tsx");
 assert.match(api,/LEFT JOIN restaurant_floor_plan_layouts p ON p\.id=a\.layout_id AND p\.tenant_id=a\.tenant_id AND p\.branch_id=a\.branch_id/);
 assert.match(api,/tableLabel:visibleTableNumber\(x\.layout_json,x\.floor_table_id\)/);
 assert.match(ui,/a\.tableLabel\|\|a\.tableId/);
 assert.match(ui,/alertStatus\(a\.status\)/);
 assert.match(ui,/متاحة.*Available.*Disponible/);
});
