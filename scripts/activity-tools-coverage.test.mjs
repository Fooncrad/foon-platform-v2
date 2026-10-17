import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ACTIVITY_PRESETS,localizedActivityModules} from "../lib/platform/activity-presets.ts";

const tools=readFileSync(new URL("../app/restaurant/activity-tools.tsx",import.meta.url),"utf8");
const codes=Object.keys(ACTIVITY_PRESETS);
test("all 15 activity types have translated and unique capability links",()=>{
 assert.equal(codes.length,15);
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
 assert.match(tools,/module\.code==="payments"\?activityPaymentsUrl\(activity,tenantId\)/);
 assert.match(tools,/module\.code==="mediaStudio"\?activityMediaStudioUrl\(activity,tenantId\)/);
 assert.match(tools,/mediaStudio:\[(?:translateUi\()?"إدارة الميديا"\)?,"Media Studio","Studio média"\]/);
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
 assert.ok(setup.includes('dir={lang==="en"||lang==="fr"?"ltr":"rtl"}'));
 assert.ok(!setup.includes("<ActivityTools"));
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

test("storefront template editor rejects responses from a different activity",()=>{
 const editor=readFileSync(new URL("../app/restaurant/activity-template-editor.tsx",import.meta.url),"utf8");
 assert.ok(editor.includes("if(d.activity!==activity)"));
 assert.ok(editor.includes("setLoading(false);return"));
});

test("merchant catalog validates product prices before sending mutations",()=>{
 const catalog=readFileSync(new URL("../app/restaurant/activity-catalog-editor.tsx",import.meta.url),"utf8");
 assert.ok(catalog.includes('Number.isFinite(Number(price))'));
 assert.ok(catalog.includes('Number(price)<0'));
 assert.ok(catalog.includes("<CatalogDetails"));
});

test("merchant catalog enforces server stock and price bounds",()=>{
 const catalog=readFileSync(new URL("../app/restaurant/activity-catalog-editor.tsx",import.meta.url),"utf8");
 const details=readFileSync(new URL("../app/restaurant/catalog-details.tsx",import.meta.url),"utf8");
 assert.ok(details.includes('max="999999999"'));
 assert.ok(details.includes('stockQuantity:number("stock")'));
 assert.ok(details.includes('max="9999999999"'));
 assert.ok(catalog.includes("Number(price)>9999999999"));
});

test("merchant catalog API validates precise measured stock and rejects coercion",()=>{
 const route=readFileSync(new URL("../app/api/restaurant/activity-catalog/route.ts",import.meta.url),"utf8");
 assert.ok(route.includes('typeof body.stockQuantity!=="number"'));
 assert.ok(route.includes("validCatalogQuantity(quantity,999999999)"));
 assert.ok(route.includes('code:"INVALID_STOCK"'));
});

test("catalog update and delete report missing records instead of false success",()=>{
 const route=readFileSync(new URL("../app/api/restaurant/activity-catalog/route.ts",import.meta.url),"utf8");
 assert.ok(route.includes('if(!changed)return NextResponse.json({ok:false,code:"CATALOG_ITEM_NOT_FOUND"},{status:404})'));
 assert.ok(route.includes('if(!deleted)return NextResponse.json({ok:false,code:"CATALOG_ITEM_NOT_FOUND"},{status:404})'));
});

test("catalog image deletion reports missing records",()=>{
 const route=readFileSync(new URL("../app/api/restaurant/activity-catalog/images/route.ts",import.meta.url),"utf8");
 assert.ok(route.includes('failure("IMAGE_NOT_FOUND",404)'));
 assert.ok(route.includes("!ordered.includes(String(body.id))"));
});
test("catalog browsing surfaces request failures",()=>{
 const editor=readFileSync(new URL("../app/restaurant/activity-catalog-editor.tsx",import.meta.url),"utf8");
 assert.ok(editor.includes('تعذر تحديث نتائج البحث'));
 assert.ok(editor.includes('تعذر تطبيق تصفية القسم'));
 assert.ok(editor.includes('تعذر تحميل الصفحة السابقة'));
 assert.ok(editor.includes('تعذر تحميل الصفحة التالية'));
});

test("merchant catalog handles malformed API errors and validates image URLs",()=>{
 const editor=readFileSync(new URL("../app/restaurant/activity-catalog-editor.tsx",import.meta.url),"utf8");
 assert.ok(editor.includes('code??"IMAGE_SAVE_FAILED"'));
 assert.ok(editor.includes('code??"DELETE_FAILED"'));
 assert.ok(editor.includes('parsed.protocol!=="https:"'));
 assert.ok(editor.includes("parsed.username||parsed.password"));
 assert.ok(editor.includes("parsed.toString().length>1024"));
});

test("merchant catalog rejects malformed initial and paginated responses",()=>{
 const editor=readFileSync(new URL("../app/restaurant/activity-catalog-editor.tsx",import.meta.url),"utf8");
 assert.ok(editor.includes('throw Error("INVALID_CATALOG_RESPONSE")'));
 assert.ok(editor.includes("!Number.isInteger(d.page)||d.page<1"));
 assert.ok(editor.includes('setTotal(d.total);setPage(d.page);setMessage("")'));
 assert.ok((editor.match(/!Array\.isArray\(d\.categories\)/g)??[]).length>=2);
});

test("public works quotation capability reaches a real merchant resource workspace",()=>{
 const dashboard=readFileSync(new URL("../app/restaurant/merchant-dashboard.tsx",import.meta.url),"utf8");
 const workspace=readFileSync(new URL("../app/restaurant/service-workspace.tsx",import.meta.url),"utf8");
 const schema=readFileSync(new URL("./restaurant-resource-schema.mjs",import.meta.url),"utf8");
 assert.ok(ACTIVITY_PRESETS.publicworks.includes("quotes"));
 assert.ok(!ACTIVITY_PRESETS.restaurant.includes("quotes"));
 assert.match(tools,/quotes:"quotes"/);
 assert.match(dashboard,/quotes:"quotes"/);
 assert.match(dashboard,/key:"quotes",label:"عروض الأسعار"/);
 assert.match(workspace,/quotes:\[\{key:"quotations",label:"عروض أسعار الخدمات"\}\]/);
 assert.match(schema,/quotations:\{kind:"service_quotation"/);
});

