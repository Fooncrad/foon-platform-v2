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
