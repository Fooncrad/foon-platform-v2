import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("favorite store migration preserves tenant/customer relationship with cascade",()=>{
 const sql=read("migrations/0211_customer_favorite_stores.sql");
 assert.match(sql,/CREATE TABLE IF NOT EXISTS customer_favorite_stores/);
 assert.match(sql,/PRIMARY KEY \(user_id,tenant_id\)/);
 assert.match(sql,/FOREIGN KEY \(tenant_id,user_id\)/);
 assert.match(sql,/REFERENCES tenant_customers\(tenant_id,user_id\) ON DELETE CASCADE/);
 assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|DELETE FROM tenant_customers/);
});
test("favorites are private, origin checked and limited to linked active stores",()=>{
 const api=read("app/api/customer/favorite-stores/route.ts");
 assert.match(api,/employeePersonalAccessDenied\(\)/);
 assert.match(api,/currentUserId\(\)/);
 assert.match(api,/assertSameOrigin\(request\)/);
 assert.match(api,/status='active'/);
 assert.match(api,/FROM tenant_customers c JOIN tenants t ON t\.id=c\.tenant_id AND t\.status='active'/);
 assert.match(api,/WHERE c\.user_id=\? AND c\.tenant_id=\?/);
 assert.match(api,/WHERE f\.user_id=\?/);
 assert.match(api,/DELETE FROM customer_favorite_stores WHERE user_id=\? AND tenant_id=\?/);
 assert.match(api,/INSERT IGNORE INTO customer_favorite_stores\(user_id,tenant_id\)/);
 assert.match(api,/STORE_NOT_LINKED/);
 assert.match(api,/Cache-Control":"no-store, private"/);
 assert.doesNotMatch(api,/SELECT \* FROM customer_favorite_stores/);
});
test("favorites provide searchable manual pin and RTL-friendly responsive affordances",()=>{
 const page=read("app/customer/page.tsx");
 const ui=read("app/customer/customer-favorite-stores.tsx");
 const css=read("app/customer/customer-experience.css");
 assert.match(page,/CustomerFavoriteStores language=\{portalLanguage\}/);
 assert.match(page,/stores\.map\(store=>\(\{id:String\(store\.id\)/);
 assert.match(ui,/input value=\{search\}/);
 assert.match(ui,/aria-pressed=\{saved\}/);
 assert.match(ui,/method:saved\?"DELETE":"POST"/);
 assert.match(ui,/window\./);
 assert.match(ui,/sort\(\(a,b\)=>Number\(favorites\.includes\(b\.id\)\)/);
 assert.match(ui,/Favorites are private to you/);
 assert.match(css,/@media\(max-width:400px\)/);
 assert.match(css,/\.customerFavoriteCard/);
});
