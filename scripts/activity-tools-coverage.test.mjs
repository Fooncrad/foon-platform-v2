import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ACTIVITY_PRESETS,localizedActivityModules} from "../lib/platform/activity-presets.ts";

const tools=readFileSync(new URL("../app/restaurant/activity-tools.tsx",import.meta.url),"utf8");
const codes=Object.keys(ACTIVITY_PRESETS);
test("all 14 activity types have translated and unique capability links",()=>{
 assert.equal(codes.length,14);
 for(const code of codes){
  for(const locale of ["ar","en","fr"]){
   const modules=localizedActivityModules(code,locale);
   assert.ok(modules.length>0,code);
   assert.equal(new Set(modules.map(x=>x.code)).size,modules.length,code);
   assert.ok(modules.every(x=>x.label&&x.label.trim()),code+":"+locale);
   assert.ok(modules.some(x=>x.code==="payments"),code);
  }
 }
});
test("business tool shortcuts include payment settings and shared media studio",()=>{
 assert.match(tools,/module\.code==="payments"\?"\/restaurant\/payments\?tenant="/);
 assert.match(tools,/module\.code==="mediaStudio"\?"\/restaurant\/media-studio\?tenant="/);
 assert.match(tools,/mediaStudio:\["إدارة الميديا","Media Studio","Studio média"\]/);
});
test("service activities do not accidentally receive restaurant tables and waiter tools",()=>{
 for(const code of ["carwash","laundry","automotive","salon","publicworks"]){
  const modules=ACTIVITY_PRESETS[code];
  for(const restaurantOnly of ["tables","waiter","kitchen","waitlist"])assert.ok(!modules.includes(restaurantOnly),code+":"+restaurantOnly);
  assert.ok(modules.includes("services"),code);
 }
});

test("activity setup fails closed on unknown types and preserves selected language",()=>{
 const setup=readFileSync(new URL("../app/restaurant/activity-setup/page.tsx",import.meta.url),"utf8");
 assert.match(setup,/const activity=isActivityType\(stored\)\?stored:null/);
 assert.doesNotMatch(setup,/isActivityType\(stored\)\?stored:"restaurant"/);
 assert.match(setup,/if\(!activity\)return/);
 assert.match(setup,/language=\{lang==="en"\|\|lang==="fr"\?lang:"ar"\}/);
});

test("activity dashboard guards against invalid activity codes before resolving modules",()=>{
 assert.match(tools,/isActivityType\(activity\)\?localizedActivityModules\(activity,lang\):\[\]/);
 assert.match(tools,/if\(!isActivityType\(activity\)\)return <section role="alert"/);
});

test("storefront template editor refuses unavailable saved templates",()=>{
 const editor=readFileSync(new URL("../app/restaurant/activity-template-editor.tsx",import.meta.url),"utf8");
 assert.match(editor,/choices\.includes\(d\.template\)/);
 assert.match(editor,/if\(!choices\.includes\(selected\)\)return/);
 assert.match(editor,/disabled=\{busy\|\|loading\|\|!choices\.includes\(selected\)\|\|selected===saved\}/);
});


test("storefront template editor resets tenant state and avoids invalid previews",()=>{
 const editor=readFileSync(new URL("../app/restaurant/activity-template-editor.tsx",import.meta.url),"utf8");
 assert.ok(!editor.includes('setLoading(true);setSaved("");setSelected(choices[0]??"");setMessage("");'));
 const setup=readFileSync(new URL("../app/restaurant/activity-setup/page.tsx",import.meta.url),"utf8");
 assert.ok(setup.includes('key={workspace.tenant_id+":"+activity}'));
 assert.ok(editor.includes('[tenantId,activity]'));
 assert.ok(editor.includes('!loading&&choices.includes(selected)&&slug'));
});
