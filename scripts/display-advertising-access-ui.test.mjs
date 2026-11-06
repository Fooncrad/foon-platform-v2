import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("display advertising shortcut remains discoverable for managers",async()=>{
 const dashboard=await read("app/restaurant/merchant-dashboard.tsx");
 assert.match(dashboard,/canManage&&<Link href=\{activityWorkspaceUrl\(data\.activityCode\)\+"\?section=displays"\}/);
});

test("standalone display route explains a missing plan grant instead of silently redirecting",async()=>{
 const page=await read("app/restaurant/displays/page.tsx");
 assert.match(page,/tenantEntitlement\(workspace\.tenant_id,"display_advertising"\)/);
 assert.match(page,/هذه الميزة غير مفعلة ضمن الباقة الحالية/);
 assert.doesNotMatch(page,/tenantEntitlement\(workspace\.tenant_id,"display_advertising"\)\)\.enabled\)redirect/);
});

test("display manager surfaces API error codes for screen and catalog loading",async()=>{
 const manager=await read("app/restaurant/display-manager.tsx");
 assert.match(manager,/تعذر تحميل الشاشات: /);
 assert.match(manager,/تعذر تحميل أصناف النشاط: /);
 assert.match(manager,/error\.message/);
});
