import test from "node:test";
import assert from "node:assert/strict";
import {ACTIVITY_PRESETS, MODULE_LABELS, defaultActivityModules, localizedActivityModules} from "../lib/platform/activity-presets.ts";
import {ACTIVITY_TEMPLATES, defaultTemplateForActivity, isTemplateForActivity} from "../lib/platform/activity-templates.ts";

const activities=Object.keys(ACTIVITY_PRESETS);
test("watches are a separate retail activity with a watch storefront and no dining tools",()=>{
 assert.ok(activities.includes("watches"));
 assert.equal(defaultTemplateForActivity("watches"),"watch-showcase");
 for(const capability of ["catalog","orders","pos","inventory","variants","delivery","pickup","payments"])assert.ok(defaultActivityModules("watches").includes(capability));
 for(const capability of ["tables","reservations","waiter","kitchen","waitlist"])assert.ok(!defaultActivityModules("watches").includes(capability));
 assert.ok(!isTemplateForActivity("watches","sufra"));
});
test("adding watches preserves the accessories storefront choices and default",()=>{
 assert.deepEqual(ACTIVITY_TEMPLATES.accessories,["accessories-grid","watch-showcase"]);
 assert.equal(defaultTemplateForActivity("accessories"),"accessories-grid");
});
test("every registered activity has a storefront template",()=>{
 assert.equal(activities.length,15);
 assert.deepEqual(Object.keys(ACTIVITY_TEMPLATES).sort(),activities.slice().sort());
 for(const activity of activities){
  const template=defaultTemplateForActivity(activity);
  assert.ok(template,activity);
  assert.ok(isTemplateForActivity(activity,template),activity);
 }
});
test("every activity module has Arabic, English and French labels",()=>{
 for(const activity of activities){
  const modules=defaultActivityModules(activity);
  assert.ok(modules.length>0,activity);
  for(const capability of modules){
   for(const locale of ["ar","en","fr"]){
    assert.ok(MODULE_LABELS[capability]?.[locale]?.trim(),activity+"/"+capability+"/"+locale);
   }
  }
 }
});
test("localized module lists preserve activity capability codes",()=>{
 for(const activity of activities){
  for(const locale of ["ar","en","fr"]){
   assert.deepEqual(localizedActivityModules(activity,locale).map(x=>x.code),[...defaultActivityModules(activity)]);
  }
 }
});
test("unsupported activities cannot silently acquire restaurant capabilities",()=>{
 assert.throws(()=>defaultActivityModules("unknown"),/UNSUPPORTED_ACTIVITY_TYPE/);
 assert.equal(defaultTemplateForActivity("unknown"),null);
});
