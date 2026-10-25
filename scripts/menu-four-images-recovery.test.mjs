import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("restaurant image API enforces one tenant's four-image gallery and synchronizes storefront cover",()=>{
 const api=read("app/api/restaurant/menu/images/route.ts");
 for(const token of [
  'requireTenantMembership(user,tenant,["owner","manager"]',
  "requireAllAdditionalBranchesUnlocked",
  "assertSameOrigin",
  "tenantEntitlement(ctx.tenantId,\"digital_menu\")",
  'restaurant_assets WHERE tenant_id=? AND id=?',
  'restaurant_menu_item_images WHERE tenant_id=? AND item_id=?',
  'if(order.length>=4)',
  'new Set(body.ids).size!==body.ids.length',
  'UPDATE restaurant_menu_items SET image_url=? WHERE tenant_id=? AND id=?',
  'INSERT INTO restaurant_audit_events',
  'legacyCover:images.length?null:rows[0].image_url??null',
  'const legacyId=randomUUID()',
  'export const POST=mutate'
 ])assert.ok(api.includes(token),token);
 assert.ok(!api.includes('fetch(body.url)'),"untrusted remote URL must never be fetched by upload");
});

test("restaurant item manager displays shared cover and allows editing four photos without new tables",()=>{
 const items=read("app/restaurant/menu/item-editor.tsx");
 const gallery=read("app/restaurant/menu/item-images.tsx");
 const endpoint=read("app/api/restaurant/menu/items/route.ts");
 for(const token of ['MenuItemImages','onChanged={refresh}','item.imageUrl?<img','nameEn','nameFr','image_url AS imageUrl'])assert.ok((items+endpoint).includes(token),token);
 for(const token of ['"/api/restaurant/assets"','"/api/restaurant/menu/images"','"POST"','"PATCH"','"DELETE"','<MediaPicker','effectiveCount>=4','image/jpeg','image/png','image/webp'])assert.ok(gallery.includes(token),token);
 assert.match(gallery,/images updated for all languages/i);
});

test("CSV import recovery allows safe discard of stale browser job without deleting server data",()=>{
 const importer=read("app/restaurant/menu/bulk-import.tsx");
 for(const token of ['discardPaused','window.confirm','localStorage.removeItem(storage)','setPaused(null)','onToggle={event','row.image_1||row.image_2||row.image_3||row.image_4','استئناف آخر استيراد','تأكيد واستيراد'])assert.ok(importer.includes(token),token);
 assert.ok(!importer.includes('DELETE /api/restaurant/catalog-import'));
 assert.match(importer,/Previously imported rows on the server will remain/);
});
