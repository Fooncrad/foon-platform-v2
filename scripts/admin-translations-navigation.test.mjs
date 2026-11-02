import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const layout=file("app/admin/layout.tsx");
const translations=file("app/admin/translations/translation-editor.tsx");
const errorBoundary=file("app/admin/translations/error.tsx");
const categoriesApi=file("app/api/restaurant/menu/categories/route.ts");
const categoriesEditor=file("app/restaurant/menu/category-editor.tsx");
const restaurantNav=file("app/restaurant/merchant-dashboard.tsx");

test("admin translations has a real reachable sidebar anchor on desktop and mobile",()=>{
 assert.match(layout,/\["\/admin\/translations","الترجمات"\]/);
 assert.equal((layout.match(/href===\"\/admin\/translations\"\?<a/g)||[]).length,2);
 assert.match(layout,/aria-current=\{active\(href\)\?"page":undefined\}/);
 assert.match(errorBoundary,/onClick=\{reset\}/);
});

test("translation editor makes API failures and retries visible",()=>{
 assert.match(translations,/TRANSLATIONS_UNAVAILABLE/);
 assert.match(translations,/role="alert"/);
 assert.match(translations,/setRetry\(value=>value\+1\)/);
 assert.match(translations,/cache:"no-store"/);
 assert.match(translations,/\["text_ar","text_en","text_fr"\]/);
});

test("menu category editor saves all three languages for new and existing categories",()=>{
 for(const name of ["name","nameEn","nameFr"])assert.match(categoriesEditor,new RegExp('\\["'+name+'"'));
 assert.match(categoriesEditor,/method:id\?"PATCH":"POST"/);
 assert.match(categoriesEditor,/defaultValue=\{category\[field\]/);
 assert.match(categoriesApi,/export async function PATCH/);
 assert.match(categoriesApi,/assertSameOrigin\(request\)/);
 assert.match(categoriesApi,/requireTenantMembership\(userId,tenant,\["owner","manager"\]/);
 assert.match(categoriesApi,/nameEn:values\.nameEn,nameFr:values\.nameFr/);
 assert.match(categoriesApi,/\.\.\.metadata\(rows\[0\]\.metadata\)/);
 assert.match(categoriesApi,/kind='menu_category'/);
});

test("restaurant dashboard section labels retain Arabic, English, and French mappings",()=>{
 const moduleKeys=[...restaurantNav.matchAll(/\{key:"([A-Za-z]+)",label:"/g)].map(match=>match[1]);
 const labels=restaurantNav.split("const sectionTranslations:")[1]?.split("const roles:")[0]??"";
 assert(moduleKeys.length>20);
 for(const key of moduleKeys){
  assert.match(labels,new RegExp("\\b"+key+":\\{en:\"[^\"]+\",fr:\"[^\"]+\"\\}"));
 }
});
