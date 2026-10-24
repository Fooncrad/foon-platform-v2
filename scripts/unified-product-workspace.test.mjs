import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ACTIVITY_PRESETS} from "../lib/platform/activity-presets.ts";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const editor=read("app/restaurant/activity-catalog-editor.tsx");
const tabs=read("app/restaurant/product-workspace-tabs.tsx");
const dashboard=read("app/restaurant/merchant-dashboard.tsx");
const options=read("app/restaurant/catalog-options.tsx");

test("all 15 activities keep a single six-part catalog workspace on the shared dashboard",()=>{
 assert.equal(Object.keys(ACTIVITY_PRESETS).length,15);
 assert.match(dashboard,/active==="menu"&&data\.activityCode!=="restaurant"/);
 assert.match(dashboard,/<ActivityCatalogEditor[^>]*activityCode=\{data\.activityCode\}[^>]*storeSlug=\{data\.slug\}/);
 for(const section of ["items","categories","groups","values","images","appearance"])
  assert.match(editor,new RegExp('id:"'+section+'"'));
 assert.match(editor,/ProductWorkspaceTabs initialTab="items"/);
 assert.match(editor,/ActivityTemplateEditor tenantId=\{tenantId\} activity=\{activityCode\?\?""\} slug=\{storeSlug\}/);
 assert.match(tabs,/role="tablist"/);
 assert.match(tabs,/role="tabpanel"/);
 assert.match(tabs,/aria-selected=\{active\.id===tab\.id\}/);
 assert.match(tabs,/active\.id===tab\.id\?tab\.content:null/);
});

test("stores retain category/product CRUD, multilingual fields, stock, variants and product image management",()=>{
 for(const token of [
  'add("category")','add("product")','update("category",c.id','update("product",p.id',
  'removeItem("category",c.id)','removeItem("product",p.id)','removeSelectedProducts(ids)',
  '<CatalogDetails','<CategoryDetails','<CatalogOptions','<CatalogImages',
  'kind="categories"','kind="items"','kind="groups"','kind="values"',
  'descriptionEn','descriptionFr','x-foon-tenant','setSelectedProductIds','query','filterCategory',
  'foonCatalogPagination','stock'
 ]){
  const normalizedToken=token==="stock"?"stock_quantity":token;
  assert.ok(editor.includes(normalizedToken),normalizedToken);
 }
 assert.match(options,/stage\?:"groups"\|"values"/);
 assert.match(options,/data-catalog-stage="groups"/);
 assert.match(options,/data-catalog-stage="values"/);
 assert.match(options,/action:"deleteValue"/);
 assert.match(options,/action:"deleteGroup"/);
 assert.match(options,/CatalogVariants/);
});

test("restaurants keep their canonical menu APIs while stores keep their activity-scoped catalog APIs",()=>{
 const menu=read("app/restaurant/menu/page.tsx");
 assert.match(menu,/MenuCategoryEditor/);
 assert.match(menu,/ItemEditor/);
 assert.match(menu,/MenuAddonsPanel/);
 assert.match(menu,/TemplateEditor/);
 assert.match(editor,/\/api\/restaurant\/activity-catalog/);
 assert.doesNotMatch(editor,/fetch\("\/api\/restaurant\/menu\/items"/);
 assert.match(editor,/return <section className=\{"adminPanel "\+styles\.manager\+" "\+styles\.unified\}/);
});

test("shared search and pagination are outside the tabs to reach products on other pages",()=>{
 const search=editor.indexOf('className={styles.catalogSearch}'),start=editor.indexOf('<ProductWorkspaceTabs initialTab'),pager=editor.indexOf('className={styles.catalogPaging}');
 assert.ok(search>0&&start>search&&pager>start);
 assert.match(editor,/onChanged=\{\(\)=>void load\(\)\}/);
 assert.match(editor,/ids\.some\(id=>!products\.some/);
 const css=read("app/restaurant/product-workspace-tabs.module.css");
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/\.panel\[hidden\]/);
});
