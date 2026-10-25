import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("favorites reuse the existing 0300 schema and user-scoped API",()=>{
 const sql=read("migrations/0300_customer_favorite_stores.sql"),api=read("app/api/customer/favorite-stores/route.ts");
 assert.match(sql,/CREATE TABLE IF NOT EXISTS customer_favorite_stores/);
 assert.match(sql,/PRIMARY KEY\(user_id,tenant_id\)/);
 assert.match(api,/employeePersonalAccessDenied/);
 assert.match(api,/currentUserId/);
 assert.match(api,/assertSameOrigin/);
 assert.match(api,/WHERE f\.user_id=\?/);
 assert.match(api,/JOIN tenant_customers tc ON tc\.tenant_id=t\.id AND tc\.user_id=\?/);
 assert.match(api,/DELETE FROM customer_favorite_stores WHERE user_id=\? AND tenant_id=\?/);
});
test("favorites provide account-localized search, explicit pinning and safe store returns",()=>{
 const page=read("app/customer/page.tsx"),ui=read("app/customer/customer-favorite-stores.tsx"),css=read("app/customer/customer-experience.css");
 assert.match(page,/CustomerFavoriteStores language=\{portalLanguage\}/);
 assert.match(page,/slug:String\(s\.slug\)/);
 assert.match(ui,/id="customer-stores"/);
 assert.match(ui,/aria-pressed=\{saved\}/);
 assert.match(ui,/type="search"/);
 assert.match(ui,/method:wasSelected\?"DELETE":"POST"/);
 assert.match(ui,/body:JSON\.stringify\(\{tenantId:id\}\)/);
 assert.match(ui,/publicStorefrontUrl\(store\.slug\)/);
 for(const lang of ["ar:{","en:{","fr:{"])assert.ok(ui.includes(lang),"missing "+lang);
 assert.match(css,/@media\(max-width:400px\)/);
});

test("favorite mutations acknowledge only persisted, authorized records",()=>{
 const api=read("app/api/customer/favorite-stores/route.ts");
 assert.match(api,/STORE_NOT_LINKED/);
 assert.match(api,/FAVORITES_LIMIT_OR_UNAVAILABLE/);
 assert.match(api,/if\(!saved\.length\)/);
 assert.match(api,/JOIN tenant_customers tc ON tc\.tenant_id=f\.tenant_id AND tc\.user_id=f\.user_id/);
 assert.match(api,/status:503/);
});
