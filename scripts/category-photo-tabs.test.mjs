import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("category cover is shared across Arabic English French with tenant scoped asset validation",()=>{
 const api=read("app/api/restaurant/menu/categories/route.ts");
 assert.match(api,/AS imageUrl FROM restaurant_menu_categories/);
 assert.match(api,/body\.imageUrl!==undefined/);
 assert.match(api,/restaurant_assets WHERE tenant_id=\?/);
 assert.match(api,/imageUrl!==undefined\?\{imageUrl\}/);
 const editor=read("app/restaurant/menu/category-editor.tsx");
 const picker=read("app/restaurant/menu/category-image-editor.tsx");
 assert.match(editor,/MenuCategoryImageEditor tenantId=\{tenantId\}/);
 assert.match(editor,/category\.imageUrl\?<img/);
 assert.match(picker,/imageUrl:photo/);
 assert.match(picker,/nameEn:category\.nameEn/);
 assert.match(picker,/nameFr:category\.nameFr/);
 for(const part of ["language","nameEn","nameFr","MediaPicker","file","image/png","image/jpeg","image/webp"])assert.ok(picker.includes(part),part);
});

test("shop categories and items show actual cover images without copying per language",()=>{
 const store=read("app/restaurant/activity-catalog-editor.tsx");
 const api=read("app/api/restaurant/activity-catalog/route.ts");
 assert.match(store,/c\.image_url\?<img/);
 assert.match(store,/p\.image_url\?<img/);
 assert.match(api,/catalog_images i WHERE i\.tenant_id=p\.tenant_id/);
 assert.match(store,/up to four photos shared by all languages/);
 const imports=read("lib/catalog/import-csv.ts");
 assert.match(imports,/image_1','image_2','image_3','image_4/);
 const save=read("lib/catalog/import-batch.ts");
 assert.match(save,/catalog_images\(id,tenant_id,product_id,image_url,sort_order\)/);
 assert.match(save,/restaurant_menu_item_images\(id,tenant_id,item_id,image_url,sort_order\)/);
});

test("six tabs are clear and accessible in Arabic English French",()=>{
 const w=read("app/restaurant/product-workspace-tabs.tsx");
 const css=read("app/restaurant/product-workspace-tabs.module.css");
 const store=read("app/restaurant/activity-catalog-editor.tsx");
 for(const key of ["items","categories","groups","values","images","appearance"]){
  assert.match(store,new RegExp('id:"'+key+'",label:'));
  assert.match(store,new RegExp('id:"'+key+'",label:[\\s\\S]*?help:tr\\('));
 }
 assert.match(w,/MerchantIcon name=\{tab\.icon\?\?TAB_ICONS\[tab\.id\]/);
 assert.match(w,/aria-selected=\{active\.id===tab\.id\}/);
 assert.match(w,/active\.help&&<p/);
 assert.match(w,/ArrowRight/);
 assert.match(w,/closest\('\[dir="rtl"\]'\)/);
 assert.match(css,/\.tabs button\.active/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/\.activeDescription/);
});
