import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("../app/restaurant/section-floor-layouts.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/restaurant/section-floor-layouts.css",import.meta.url),"utf8");

test("floor tabs expose saved plans and a new plan in all three languages",()=>{
 assert.match(ui,/foonFloorPlanTabs/);
 assert.match(ui,/layouts\.map\(layout=>/);
 assert.match(ui,/aria-pressed=\{current===layout\.id\}/);
 assert.match(ui,/\+ مخطط جديد/);
 assert.match(ui,/\+ Nouveau plan/);
 assert.match(ui,/\+ New plan/);
});
test("tab navigation protects unsaved plans and in-flight saves",()=>{
 assert.match(ui,/function openLayout\(id:string\)\{/);
 assert.match(ui,/if\(saving\)return/);
 assert.match(ui,/JSON\.stringify\(plan\)!==JSON\.stringify\(saved\.plan\)/);
 assert.match(ui,/if\(dirty&&!window\.confirm/);
 assert.match(ui,/disabled=\{saving\}/);
});
test("mobile tab row scrolls internally without widening the viewport",()=>{
 assert.match(css,/\.foonFloorPlanTabs\{[^}]*max-width:100%/);
 assert.match(css,/\.foonFloorPlanTabs\{[^}]*overflow-x:auto/);
 assert.match(css,/\.foonFloorPlanTabs button\{[^}]*max-width:min\(250px,75vw\)/);
});
