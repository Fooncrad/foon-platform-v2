import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validateResource,ResourceError} from "./restaurant-resource-schema.mjs";
const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const item="01234567-89ab-cdef-0123-456789abcdef";
test("legacy add-on required/multiple selection, order and translations survive restaurant schema validation",()=>{
 const input=validateResource("menuGroups",{name:"الإضافات",status:"active",data:{itemId:item,selectionType:"multiple",requiredFlag:"yes",minSelect:1,maxSelect:3,sortOrder:2,nameEn:"Extras",nameFr:"Suppléments"}});
 assert.equal(input.data.minSelect,1);assert.equal(input.data.maxSelect,3);assert.equal(input.data.sortOrder,2);
 assert.equal(input.data.nameEn,"Extras");assert.equal(input.data.nameFr,"Suppléments");
});
test("restaurant add-ons preserve zero stock, fractional stock, image, ordering and availability",()=>{
 for(const stock of [0,0.5,20]){
  const input=validateResource("menuValues",{name:"إضافة",status:"inactive",data:{groupId:item,priceDelta:2.5,stockQuantity:stock,sortOrder:4,imageUrl:"https://example.com/option.jpg",nameEn:"Add-on",nameFr:"Option"}});
  assert.equal(input.status,"inactive");assert.equal(input.data.stockQuantity,stock);assert.equal(input.data.sortOrder,4);assert.equal(input.data.priceDelta,2.5);
 }
 assert.throws(()=>validateResource("menuValues",{name:"Bad",status:"active",data:{groupId:item,priceDelta:1,stockQuantity:-1}}),ResourceError);
});
test("shared catalog and restaurant add-ons recheck tenant and stock when ordering",()=>{
 const catalog=source("app/api/restaurant/activity-catalog/options/route.ts");
 const menu=source("lib/restaurant/menu.ts");
 const orders=source("lib/restaurant/operations.ts");
 const shared=source("lib/restaurant/activity-pos.ts");
 const ui=source("app/restaurant/catalog-options.tsx");
 const restaurant=source("app/restaurant/menu/addons-panel.tsx");
 const page=source("app/restaurant/menu/page.tsx");
 for(const action of ["toggleGroup","toggleValue","updateValue","updateGroup"])assert.ok(catalog.includes(action),action);
 assert.match(catalog,/assertSameOrigin\(request\)/);
 assert.match(catalog,/requireTenantMembership\(user,tenant,\["owner","manager"\]/);
 assert.match(catalog,/tenantEntitlement\(ctx\.tenantId,"variants",db\)/);
 assert.match(catalog,/g\.tenant_id=v\.tenant_id/);
 assert.match(menu,/v\.stock_quantity IS NULL OR v\.stock_quantity>0/);
 assert.match(orders,/SELECT stock_quantity FROM restaurant_menu_option_values WHERE tenant_id=\? AND id=\? FOR UPDATE/);
 assert.match(orders,/restaurantOptionDebits/);
 assert.match(shared,/FOR UPDATE/);
 assert.match(ui,/exportAddonsCsv/);
 assert.match(restaurant,/decodeCsv/);
 assert.match(restaurant,/importFile/);
 assert.match(page,/MenuAddonsPanel/);
});
test("additive migration retains existing options and enables stock accounting",()=>{
 const sql=source("migrations/0160_restaurant_option_stock.sql");
 assert.match(sql,/ALTER TABLE restaurant_menu_option_values/);
 assert.match(sql,/ADD COLUMN stock_quantity DECIMAL\(12,3\) NULL DEFAULT NULL/);
 assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|DELETE FROM/i);
});

test("all merchant activities explain add-on setup, availability and preview in three languages",()=>{
 const menu=source("app/restaurant/menu/addons-panel.tsx");
 const catalog=source("app/restaurant/catalog-options.tsx");
 const styles=source("app/globals.css");
 for(const [label,ui] of [["restaurant",menu],["catalog",catalog]]){
  assert.match(ui,/foonAddonsWorkflow/,label+" explains the setup sequence");
  assert.match(ui,/foonAddonsStats/,label+" shows group and value counts");
  assert.match(ui,/foonAddonsWarning/,label+" warns about required groups with no available choices");
  assert.match(ui,/foonAddonsPreview/,label+" exposes an illustrative customer preview");
  assert.match(ui,/foonAddonsEmpty/,label+" guides users with empty results");
  assert.match(ui,/toLocaleLowerCase\(\)/,label+" prevents duplicate choice/group names");
  assert.match(ui,/price/,label+" provides price setup");
 }
 assert.match(menu,/activeValues\(g\.id\)/);
 assert.match(menu,/stockQuantity===null\|\|v\.data\.stockQuantity===undefined/);
 assert.match(catalog,/v\.enabled&&\(v\.stock_quantity===null\|\|Number\(v\.stock_quantity\)>0\)/);
 assert.match(catalog,/if\(!checkGroupDraft\(\)\)return/);
 assert.match(catalog,/if\(!checkValueDraft\(\)\)return/);
 assert.match(catalog,/INVALID_OPTIONS_RESPONSE/);
 assert.match(styles,/@media\(max-width:420px\)/);
 assert.match(styles,/\.foonAddonsPreview/);
});
