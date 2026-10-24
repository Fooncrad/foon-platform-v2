import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ACTIVITY_PRESETS} from "../lib/platform/activity-presets.ts";
import {activityToolLinks} from "../lib/platform/activity-tool-links.ts";
import {ACTIVITY_IDENTITY_ICONS,activityIdentityIcon,activitySectionIcon,activityToolIcon} from "../lib/platform/activity-icons.ts";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const activities=Object.keys(ACTIVITY_PRESETS);
const renderedIcons=new Set([...read("app/restaurant/merchant-icon.tsx").matchAll(/^\s+([a-zA-Z]+):</gm)].map(x=>x[1]));

test("all fifteen registered activities use distinct, drawable identity icons",()=>{
 assert.equal(activities.length,15);
 assert.deepEqual(Object.keys(ACTIVITY_IDENTITY_ICONS).sort(),[...activities].sort());
 assert.equal(new Set(Object.values(ACTIVITY_IDENTITY_ICONS)).size,15);
 for(const activity of activities){
  const identity=activityIdentityIcon(activity);
  assert.ok(renderedIcons.has(identity),activity+":"+identity);
  assert.equal(activitySectionIcon(activity,"menu"),identity);
  const capability=activity==="carwash"||activity==="automotive"||activity==="laundry"||activity==="salon"||activity==="publicworks"?"services":"catalog";
  assert.equal(activityToolIcon(activity,[capability]),identity);
 }
 assert.equal(activityIdentityIcon("unknown"),"store");
 assert.equal(activityToolIcon("unknown",["services"]),"store");
});

test("non-food stores and services never inherit cutlery, kitchen or restaurant-brand icons",()=>{
 const nonDining=activities.filter(activity=>!["restaurant","cafe","sweets"].includes(activity));
 for(const activity of nonDining){
  const icon=activityIdentityIcon(activity);
  assert.notEqual(icon,"menu",activity);
  assert.notEqual(icon,"chef",activity);
  assert.notEqual(icon,"table",activity);
 }
 for(const activity of ["carwash","automotive","laundry","salon","publicworks"]){
  assert.notEqual(activitySectionIcon(activity,"serviceOrders"),"menu",activity);
  assert.notEqual(activitySectionIcon(activity,"serviceOrders"),"chef",activity);
  assert.equal(activitySectionIcon(activity,"reservations"),"calendar",activity);
  assert.equal(activitySectionIcon(activity,"orders"),"clipboard",activity);
  assert.equal(activityToolIcon(activity,["orders"]),"clipboard",activity);
 }
 assert.equal(activityIdentityIcon("automotive"),"car");
 assert.equal(activityIdentityIcon("carwash"),"carwash");
 assert.equal(activityIdentityIcon("laundry"),"washer");
 assert.equal(activityIdentityIcon("salon"),"scissors");
 assert.equal(activityIdentityIcon("publicworks"),"hardhat");
 assert.equal(activityIdentityIcon("clothing"),"shirt");
 assert.equal(activityIdentityIcon("perfume"),"perfume");
 assert.equal(activityIdentityIcon("grocery"),"basket");
});

test("all visible activity tool links use real merchant icons for every language",()=>{
 for(const activity of activities){
  for(const lang of ["ar","en","fr"]){
   const links=activityToolLinks(activity,"sample-tenant",lang);
   assert.ok(links.length,activity);
   for(const link of links){
    const icon=activityToolIcon(activity,link.codes);
    assert.ok(renderedIcons.has(icon),activity+"/"+lang+"/"+link.codes.join("+")+": "+icon);
   }
  }
 }
 for(const section of ["overview","orders","pos","tables","roomService","inventory","pickupPoints","serviceOrders","quotes","printers","team","marketing","reservations","reports","customers","storefront","publicControls","remote","payments","security","health","subscription"]){
  for(const activity of activities)assert.ok(renderedIcons.has(activitySectionIcon(activity,section)),activity+":"+section);
 }
});

test("one shared icon system powers sidebar, drawer, search, quick actions and overview cards",()=>{
 const dashboard=read("app/restaurant/merchant-dashboard.tsx");
 const tools=read("app/restaurant/activity-tools.tsx");
 assert.match(dashboard,/name=\{activityIdentityIcon\(data\.activityCode\)\}/);
 assert.equal((dashboard.match(/name=\{activitySectionIcon\(data\.activityCode,m\.key,m\.icon\)\}/g)??[]).length,3);
 assert.match(tools,/name=\{activityToolIcon\(activity,link\.codes\)\}/);
 assert.doesNotMatch(tools,/TOOL_ICONS/);
});
