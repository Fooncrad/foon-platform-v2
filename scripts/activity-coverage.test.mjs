import test from "node:test";
import assert from "node:assert/strict";
import {ACTIVITY_PRESETS, MODULE_LABELS, defaultActivityModules, localizedActivityModules} from "../lib/platform/activity-presets.ts";
import {ACTIVITY_TEMPLATES, defaultTemplateForActivity, isTemplateForActivity} from "../lib/platform/activity-templates.ts";

const activities=Object.keys(ACTIVITY_PRESETS);
test("every registered activity has a storefront template",()=>{
 assert.equal(activities.length,14);
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
  for(const module of modules){
   for(const locale of ["ar","en","fr"]){
    assert.ok(MODULE_LABELS[module]?.[locale]?.trim(),activity+"/"+module+"/"+locale);
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
