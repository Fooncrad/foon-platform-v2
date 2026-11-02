import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ACTIVITY_PRESETS} from "../lib/platform/activity-presets.ts";
import {ACTIVITY_TEMPLATES} from "../lib/platform/activity-templates.ts";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("catalog API is tenant scoped and requires owner or manager",()=>{
 const api=read("app/api/restaurant/activity-catalog/route.ts");
 assert.match(api,/requireTenantMembership\(user,tenant,\["owner","manager"\]/);
 assert.match(api,/tenant_id=\?/);
 assert.match(api,/assertSameOrigin\(request\)/);
});
test("catalog editor exposes search, pagination and product translation",()=>{
 const ui=read("app/restaurant/activity-catalog-editor.tsx");
 for(const feature of ["filterCategory","foonCatalogPagination","name_en","name_fr","addImage"]){
  assert.ok(ui.includes(feature),feature);
 }
});
test("activity template API enforces activity-specific choices",()=>{
 const api=read("app/api/restaurant/activity-template/route.ts");
 assert.match(api,/isTemplateForActivity\(ctx\.activity!,template\)/);
 assert.match(api,/requireTenantMembership\(userId,tenant,\["owner","manager"\]/);
});
test("all activity types are covered by the merchant workspace",()=>{
 const page=read("app/restaurant/page.tsx");
 assert.match(page,/defaultActivityModules\(activityCode\)/);
 assert.equal(Object.keys(ACTIVITY_PRESETS).length,15);
});

test("every non-restaurant storefront template has an explicit visual treatment",()=>{
 const css=read("app/[slug]/activity-storefront.css");
 for(const [activity,templates] of Object.entries(ACTIVITY_TEMPLATES)){
  if(activity==="restaurant")continue;
  for(const template of templates)assert.ok(css.includes(`data-template="${template}"`),activity+"/"+template);
 }
});
