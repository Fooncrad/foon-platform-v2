import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync(new URL("../app/api/customer/favorite-stores/route.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../app/customer/customer-favorite-stores.tsx",import.meta.url),"utf8");
const migration=readFileSync(new URL("../migrations/0300_customer_favorite_stores.sql",import.meta.url),"utf8");
const page=readFileSync(new URL("../app/customer/page.tsx",import.meta.url),"utf8");
test("favorite stores must be scoped to current user and never grant staff access",()=>{
 assert.match(route,/employeePersonalAccessDenied/);
 assert.match(route,/currentUserId/);
 assert.match(route,/assertSameOrigin/);
 assert.match(route,/WHERE f\.user_id=\?/);
 assert.match(route,/WHERE user_id=\? AND tenant_id=\?/);
 assert.match(route,/JOIN tenant_customers tc ON tc\.tenant_id=t\.id AND tc\.user_id=\?/);
});
test("favorites require a unique customer-tenant pair and cascading cleanup",()=>{
 assert.match(migration,/PRIMARY KEY\(user_id,tenant_id\)/);
 assert.equal((migration.match(/ON DELETE CASCADE/g)||[]).length,2);
});
test("the customer hub has a real localized favorite toggle",()=>{
 assert.match(ui,/fetch\("\/api\/customer\/favorite-stores"/);
 assert.match(ui,/aria-pressed/);
 assert.match(ui,/ar:\{/);
 assert.match(ui,/en:\{/);
 assert.match(ui,/fr:\{/);
 assert.match(page,/CustomerFavoriteStores/);
});
