import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
test("display advertising schema is additive and tenant/branch scoped",async()=>{
 const sql=await read("migrations/9999_display_advertising.sql");
 assert.match(sql,/CREATE TABLE IF NOT EXISTS display_screens/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS display_slides/);
 assert.match(sql,/tenant_id VARCHAR\(36\) NOT NULL/);
 assert.match(sql,/ON DELETE CASCADE/);
 assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|DELETE FROM/i);
});
test("merchant display management requires tenant membership, plan entitlement and owner/manager roles",async()=>{
 const api=await read("app/api/restaurant/displays/route.ts");
 assert.match(api,/requireTenantMembership/);
 assert.match(api,/\["owner","manager"\]/);
 assert.match(api,/tenantEntitlement\(tenant,"campaigns"\)/);
 assert.match(api,/WHERE id=\? AND tenant_id=\?/);
});
test("slide media must be a same-tenant FOON asset, never an arbitrary external URL",async()=>{
 const api=await read("app/api/restaurant/displays/route.ts");
 assert.match(api,/\/api\/restaurant\/assets\//);
 assert.match(api,/SELECT id FROM restaurant_assets WHERE id=\? AND tenant_id=\?/);
});
test("public playback uses an unguessable token hash and only active scheduled slides",async()=>{
 const api=await read("app/api/display/[token]/route.ts");
 assert.match(api,/createHash\("sha256"\)/);
 assert.match(api,/token_hash=\?/);
 assert.match(api,/enabled=TRUE AND \(starts_at IS NULL OR starts_at<=UTC_TIMESTAMP\(\)\)/);
 assert.match(api,/ends_at IS NULL OR ends_at>UTC_TIMESTAMP\(\)/);
});
test("merchant workspace exposes the displays module and a fullscreen public player",async()=>{
 const dashboard=await read("app/restaurant/merchant-dashboard.tsx");
 const manager=await read("app/restaurant/display-manager.tsx");
 const player=await read("app/display/[token]/display-player.tsx");
 assert.match(dashboard,/restaurant\/displays\?tenant=/);
 assert.match(manager,/إدارة شاشات الإعلانات/);
 assert.match(player,/position:"fixed",inset:0/);
});

test("display creatives upload through the existing tenant asset pipeline and support schedules",async()=>{
 const api=await read("app/api/restaurant/displays/route.ts");
 const publicApi=await read("app/api/display/[token]/route.ts");
 const manager=await read("app/restaurant/display-manager.tsx");
 const player=await read("app/display/[token]/display-player.tsx");
 assert.match(api,/INVALID_SCHEDULE/);
 assert.match(publicApi,/starts_at IS NULL OR starts_at<=UTC_TIMESTAMP/);
 assert.match(manager,/FormData\(\)/);
 assert.match(manager,/\/api\/restaurant\/assets/);
 assert.match(manager,/datetime-local/);
 assert.match(player,/screen\.refreshSeconds/);
});

test("public player can show the tenant storefront QR when enabled",async()=>{
 const publicApi=await read("app/api/display/[token]/route.ts");
 const player=await read("app/display/[token]/display-player.tsx");
 const manager=await read("app/restaurant/display-manager.tsx");
 assert.match(publicApi,/qrUrl:new URL\(_req.url\)\.origin/);
 assert.match(player,/QRCode\.toDataURL/);
 assert.match(player,/data\.screen\.qrEnabled/);
 assert.match(manager,/qrEnabled:!s\.qr_enabled/);
});
