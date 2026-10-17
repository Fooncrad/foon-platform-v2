import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const source=readFileSync(new URL("../lib/platform/activity-presets.ts",import.meta.url),"utf8");
const signup=readFileSync(new URL("../lib/tenant/registration-activities.ts",import.meta.url),"utf8");
const codes=[...signup.matchAll(/\{id:"([^"]+)",group:/g)].map(m=>m[1]);
assert.match(readFileSync(new URL("../app/register/page.tsx",import.meta.url),"utf8"),/registrationActivities as activities/);
const presets=[...source.matchAll(/^  ([a-z_]+): \[/gm)].map(m=>m[1]);
test("every registration activity has an operational preset",()=>{
 assert.deepEqual([...presets].sort(),[...codes].sort());
 assert.equal(new Set(codes).size,codes.length);
});
test("grocery excludes restaurant-only tools",()=>{
 const grocery=source.match(/^  grocery: \[([^\n]+)\]/m)?.[1]??"";
 for(const forbidden of ["tables","waiter","kitchen","reservations"])assert.ok(!grocery.includes('"'+forbidden+'"'),forbidden);
 for(const required of ["barcode","inventory","pos","delivery"])assert.ok(grocery.includes('"'+required+'"'),required);
});
test("module translations cover each declared capability",()=>{
 const modules=new Set([...source.matchAll(/"([a-z]+)"/g)].map(m=>m[1]));
 for(const code of ["catalog","orders","pos","tables","reservations","waitlist","kitchen","waiter","inventory","barcode","suppliers","delivery","pickup","variants","services","bookings","staff","quotes","invoices"]){
 assert.ok(modules.has(code));
 assert.match(source,new RegExp("^  "+code+":\\{ar:.*en:.*fr:","m"));
 }
});
