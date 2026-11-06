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
 assert.match(api,/tenantEntitlement\(tenant,"display_advertising"\)/);
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
 assert.match(api,/s.enabled=TRUE AND \(s.campaign_match_key IS NULL OR s.campaign_match_key=\?\) AND \(s.starts_at IS NULL OR s.starts_at<=UTC_TIMESTAMP\(\)\)/);
 assert.match(api,/s.ends_at IS NULL OR s.ends_at>UTC_TIMESTAMP\(\)/);
});
test("merchant workspace exposes the displays module and a fullscreen public player",async()=>{
 const dashboard=await read("app/restaurant/merchant-dashboard.tsx");
 const manager=await read("app/restaurant/display-manager.tsx");
 const player=await read("app/display/[token]/display-player.tsx");
 assert.match(dashboard,/key:"displays",label:"إعلانات الشاشات",icon:"dashboard",feature:"display_advertising"/);
 assert.match(dashboard,/active==="displays"\?\<DisplayManager/);
 assert.match(manager,/إدارة شاشات الإعلانات/);
 assert.match(player,/position:"fixed",inset:0/);
});

test("display creatives upload through the existing tenant asset pipeline and support schedules",async()=>{
 const api=await read("app/api/restaurant/displays/route.ts");
 const publicApi=await read("app/api/display/[token]/route.ts");
 const manager=await read("app/restaurant/display-manager.tsx");
 const player=await read("app/display/[token]/display-player.tsx");
 assert.match(api,/INVALID_SCHEDULE/);
 assert.match(publicApi,/s.starts_at IS NULL OR s.starts_at<=UTC_TIMESTAMP/);
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
 assert.match(player,/screen\.qrEnabled/);
 assert.match(manager,/qrEnabled:!s\.qr_enabled/);
});

test("hosted video and multi-zone layouts are constrained and rendered",async()=>{
 const api=await read("app/api/restaurant/displays/route.ts");
 const player=await read("app/display/[token]/display-player.tsx");
 const manager=await read("app/restaurant/display-manager.tsx");
 assert.match(api,/INVALID_VIDEO_URL/);
 assert.match(api,/parsed\.protocol!=="https:"/);
 assert.match(api,/mp4|webm/);
 assert.match(player,/autoPlay muted loop/);
 assert.match(player,/quad/);
 assert.match(manager,/displayLayout:e\.target\.value/);
 assert.match(manager,/videoUrl/);
});

test("player heartbeat and transition/badge effects are wired end to end",async()=>{
 const api=await read("app/api/restaurant/displays/route.ts");
 const publicApi=await read("app/api/display/[token]/route.ts");
 const manager=await read("app/restaurant/display-manager.tsx");
 const player=await read("app/display/[token]/display-player.tsx");
 assert.match(api,/AS is_online/);
 assert.match(publicApi,/SET last_seen_at=UTC_TIMESTAMP/);
 assert.match(api,/transition_effect,badge_text/);
 assert.match(api,/SLIDE_REORDER_FAILED/);
 assert.match(api,/body.move==="up"\|\|body.move==="down"/);
 assert.match(player,/foon-display-kenburns/);
 assert.match(player,/item\.badge_text/);
 assert.match(manager,/is_online/);
});

test("kiosk PIN protection uses salted scrypt, signed short-lived sessions and failed-attempt lockout",async()=>{
 const helper=await read("lib/display/kiosk-security.ts");
 const admin=await read("app/api/restaurant/displays/route.ts");
 const publicApi=await read("app/api/display/[token]/route.ts");
 const player=await read("app/display/[token]/display-player.tsx");
 assert.match(helper,/scryptSync/);
 assert.match(helper,/timingSafeEqual/);
 assert.match(helper,/createHmac/);
 assert.match(publicApi,/kiosk_failed_attempts/);
 assert.match(publicApi,/KIOSK_TEMPORARILY_LOCKED/);
 assert.match(publicApi,/HttpOnly; Secure; SameSite=Strict/);
 assert.match(admin,/kiosk_pin_hash/);
 assert.match(player,/unlockKiosk/);
 assert.match(player,/شاشة محمية/);
});
test("campaign matching keys filter only the matching slides",async()=>{
 const migration=await read("migrations/9999_display_advertising_kiosk_campaign_matching.sql");
 const admin=await read("app/api/restaurant/displays/route.ts");
 const publicApi=await read("app/api/display/[token]/route.ts");
 const manager=await read("app/restaurant/display-manager.tsx");
 const player=await read("app/display/[token]/display-player.tsx");
 assert.match(migration,/campaign_match_key VARCHAR\(80\)/);
 assert.match(admin,/INVALID_CAMPAIGN_KEY/);
 assert.match(admin,/campaign_match_key/);
 assert.match(publicApi,/s.campaign_match_key IS NULL OR s.campaign_match_key=\?/);
 assert.match(manager,/Campaign key/);
 assert.match(player,/window\.location\.search\.match\(\/\[\?&\]campaign=/);
});
test("public display offline cache stores only unprotected playlists and same-origin image assets",async()=>{
 const api=await read("app/api/display/[token]/route.ts");
 const worker=await read("public/foon-offline-sw.js");
 const page=await read("app/display/[token]/page.tsx");
 assert.match(api,/X-FOON-Display-Offline/);
 assert.match(worker,/x-foon-display-offline/);
 assert.match(worker,/DISPLAY_CACHE/);
 assert.match(worker,/publicImage\(path\)/);
 assert.match(page,/OfflineWorker/);
});


test("display player combines authenticated WebSocket invalidations with polling recovery",async()=>{
 const player=await read("app/display/[token]/display-player.tsx");
 const ticketRoute=await read("app/api/display/[token]/realtime-ticket/route.ts");
 const realtime=await read("lib/display/realtime.ts");
 const admin=await read("app/api/restaurant/displays/route.ts");
 const relay=await read("services/display-realtime/server.mjs");
 assert.match(player,/new window\.WebSocket\(/);
 assert.match(player,/typeof window\.WebSocket!=="function"/);
 assert.match(player,/realtime-ticket/);
 assert.match(player,/typeof window\.fetch==="function"/);
 assert.match(player,/new XMLHttpRequest\(\)/);
 assert.doesNotMatch(player,/new URL\(auth\.url\)/);
 assert.match(player,/setInterval\(\(\)=>void load\(\)/);
 assert.match(ticketRoute,/verifyKioskSession/);
 assert.match(ticketRoute,/createDisplayRealtimeTicket/);
 assert.match(realtime,/createHmac/);
 assert.match(admin,/publishDisplayInvalidation/);
 assert.match(relay,/verifyTicket/);
 assert.match(relay,/display\.invalidate/);
});

test("live display creatives resolve tenant-owned restaurant menu and activity catalog products",async()=>{
 const admin=await read("app/api/restaurant/displays/route.ts");
 const sources=await read("app/api/restaurant/displays/sources/route.ts");
 const player=await read("app/api/display/[token]/route.ts");
 const migration=await read("migrations/9999_display_catalog_sources.sql");
 const manager=await read("app/restaurant/display-manager.tsx");
 assert.match(migration,/source_type ENUM/);
 assert.match(admin,/sourceType==="restaurant_menu_item"/);
 assert.match(admin,/sourceType==="catalog_product"/);
 assert.match(admin,/sourceType==="restaurant_menu_category"/);
 assert.match(admin,/sourceType==="catalog_category"/);
 assert.match(sources,/restaurant_menu_items/);
 assert.match(sources,/catalog_products/);
 assert.match(sources,/restaurant_menu_categories/);
 assert.match(sources,/catalog_categories/);
 assert.match(player,/COALESCE\(s\.title_ar,mi\.name,cp\.name_ar,mc\.name,cc\.name_ar\)/);
 assert.match(player,/catalog_images/);
 assert.match(manager,/\/api\/restaurant\/displays\/sources/);
 assert.match(manager,/sourceId:chosenSource\?\.id/);
});

test("display manager can import tenant-authorized images from the FOON account library",async()=>{
 const manager=await read("app/restaurant/display-manager.tsx");
 const library=await read("app/api/account/library/route.ts");
 const assets=await read("app/api/restaurant/assets/route.ts");
 assert.match(manager,/fetch\("\/api\/account\/library"/);
 assert.match(manager,/librarySelection/);
 assert.match(manager,/libraryId:librarySelection/);
 assert.match(manager,/\/api\/restaurant\/assets/);
 assert.match(library,/user_media_library/);
 assert.match(assets,/body\.libraryId/);
 assert.match(assets,/user_media_library WHERE user_id=\?/);
});


test("one display campaign fans out atomically to every active screen in selected branches",async()=>{
 const migration=await read("migrations/9999_display_unified_campaigns.sql");
 const api=await read("app/api/restaurant/displays/route.ts");
 const manager=await read("app/restaurant/display-manager.tsx");
 const player=await read("app/api/display/[token]/route.ts");
 assert.match(migration,/ADD COLUMN campaign_id CHAR\(36\) NULL/);
 assert.match(migration,/display_slides_campaign_id_idx/);
 assert.match(api,/action==="campaign"/);
 assert.match(api,/includeDisplays=body\.includeDisplays!==false/);
 assert.match(api,/NO_CAMPAIGN_DESTINATIONS/);
 assert.match(api,/SELECT id,branch_id FROM display_screens WHERE tenant_id=\? AND enabled=TRUE AND paused=FALSE/);
 assert.match(api,/requestedBranches/);
 assert.match(api,/beginTransaction\(\)/);
 assert.match(api,/await conn\.commit\(\)/);
 assert.match(api,/await conn\.rollback\(\)/);
 assert.match(api,/campaign_id,media_url/);
 assert.match(api,/campaignId/);
 assert.match(api,/campaign_match_key/);
 assert.match(api,/publishDisplayInvalidation/);
 assert.match(api,/TOO_MANY_DISPLAYS/);
 assert.match(manager,/campaignScope/);
 assert.match(manager,/campaignBranchIds/);
 assert.match(manager,/action:"campaign"/);
 assert.match(manager,/Show campaign on displays/);
 assert.match(manager,/نشر الحملة الموحدة/);
 assert.match(player,/s\.campaign_match_key IS NULL OR s\.campaign_match_key=\?/);
});

test("editing or deleting one campaign slide applies to the whole campaign",async()=>{
 const api=await read("app/api/restaurant/displays/route.ts");
 assert.match(api,/SELECT id,screen_id,campaign_id FROM display_slides/);
 assert.match(api,/UPDATE display_slides SET enabled=\? WHERE campaign_id=\?/);
 assert.match(api,/DELETE FROM display_slides WHERE campaign_id=\?/);
 assert.match(api,/updatedScreens/);
 assert.match(api,/deletedScreens/);
});


test("unified campaign can publish the same FOON image into the public menu cover",async()=>{
 const api=await read("app/api/restaurant/displays/route.ts");
 const manager=await read("app/restaurant/display-manager.tsx");
 const publicMenu=await read("app/[slug]/public-menu.tsx");
 const activityStorefront=await read("app/[slug]/activity-storefront.tsx");
 assert.match(manager,/includeMenuBanner/);
 assert.match(manager,/includeDisplays/);
 assert.match(manager,/Also show the campaign image in the menu cover banner/);
 assert.match(api,/includeMenuBanner=body\.includeMenuBanner===true/);
 assert.match(api,/BANNER_REQUIRES_FOON_IMAGE/);
 assert.match(api,/saveResource\(conn,ctx\.tenant,ctx\.user,ctx\.role,"storefront"/);
 assert.match(api,/coverUrl/);
 assert.match(publicMenu,/branding\.coverUrl/);
 assert.match(activityStorefront,/branding\.coverUrl/);
});


test("unified campaigns are first-class tenant records with a cascading slide relationship",async()=>{
 const migration=await read("migrations/9999_display_z_campaign_lifecycle.sql");
 const api=await read("app/api/restaurant/displays/route.ts");
 const manager=await read("app/restaurant/display-manager.tsx");
 assert.match(migration,/CREATE TABLE IF NOT EXISTS display_campaigns/);
 assert.match(migration,/destinations JSON NOT NULL/);
 assert.match(migration,/branch_ids JSON NULL/);
 assert.match(migration,/creative JSON NOT NULL/);
 assert.match(migration,/previous_cover_url VARCHAR\(500\)/);
 assert.match(migration,/applied_cover_url VARCHAR\(500\)/);
 assert.match(migration,/ON DELETE CASCADE/);
 assert.match(api,/INSERT INTO display_campaigns/);
 assert.match(api,/SELECT id,CASE WHEN status='paused' THEN 'paused'/);
 assert.match(api,/destinations,branch_ids,creative/);
 assert.match(api,/UPDATE display_campaigns SET previous_cover_url/);
 assert.match(manager,/type Campaign=/);
 assert.match(manager,/\[campaigns,setCampaigns\]=useState<Campaign\[]>\(\[\]\)/);
 assert.match(manager,/setCampaigns\(Array\.isArray\(d\.campaigns\)/);
 assert.match(manager,/مستودع الإعلانات/);
});

test("campaign pause, resume and delete preserve manually changed menu covers",async()=>{
 const api=await read("app/api/restaurant/displays/route.ts");
 const manager=await read("app/restaurant/display-manager.tsx");
 assert.match(api,/body\.kind==="campaign"/);
 assert.match(api,/UPDATE display_slides SET enabled=FALSE WHERE campaign_id/);
 assert.match(api,/UPDATE display_slides SET enabled=TRUE WHERE campaign_id/);
 assert.match(api,/DELETE FROM display_campaigns WHERE id=\? AND tenant_id=\?/);
 assert.match(api,/storefrontData\.displayCampaignId===String\(body\.id\)/);
 assert.match(api,/storefrontData\.coverUrl===appliedCover/);
 assert.match(api,/delete nextData\.displayCampaignId/);
 assert.match(manager,/action:"pause"/);
 assert.match(manager,/action:"resume"/);
 assert.match(manager,/action:"delete"/);
});

test("moving one campaign slide reorders the same campaign on every target screen",async()=>{
 const api=await read("app/api/restaurant/displays/route.ts");
 assert.match(api,/SELECT id,screen_id,sort_order,campaign_id FROM display_slides/);
 assert.match(api,/SELECT id,screen_id,sort_order FROM display_slides WHERE campaign_id/);
 assert.match(api,/campaign_id<>\?/);
 assert.match(api,/changedScreens/);
});


test("selecting a catalog source never submits its external image URL as a FOON asset and disables incompatible menu-cover publishing",async()=>{
 const manager=await read("app/restaurant/display-manager.tsx");
 assert.match(manager,/const sourceImage=next\?\.imageUrl\?\?""/);
 assert.match(manager,/const isFoonAsset=sourceImage\.startsWith\("\/api\/restaurant\/assets\/"\)/);
 assert.match(manager,/setMedia\(isFoonAsset\?sourceImage:""\)/);
 assert.match(manager,/if\(!isFoonAsset\)setIncludeMenuBanner\(false\)/);
});

test("catalog-backed campaigns auto-select product images and allow a tenant-owned library override",async()=>{
 const api=await read("app/api/restaurant/displays/route.ts");
 const sources=await read("app/api/restaurant/displays/sources/route.ts");
 const manager=await read("app/restaurant/display-manager.tsx");
 assert.match(sources,/imageUrl:x\.image_url\?String\(x\.image_url\):null/);
 assert.match(manager,/setMedia\(next\?\.imageUrl\?\?\"\"\)/);
 assert.match(manager,/mediaUrl:media\|\|null/);
 assert.match(manager,/Campaign image/);
 assert.match(manager,/importLibraryImage/);
 assert.match(api,/const mediaUrl=typeof body\.mediaUrl===\"string\"/);
 assert.match(api,/if\(body\.mediaUrl!=null&&body\.mediaUrl!==\"\"&&!mediaUrl\)/);
 assert.match(api,/SELECT id FROM restaurant_assets WHERE id=\? AND tenant_id=\? LIMIT 1/);
 assert.match(api,/sourceType===\"media\"\?/);
});


test("ad library separates available and paused campaigns and explains empty display targets",async()=>{
 const api=await read("app/api/restaurant/displays/route.ts");
 const manager=await read("app/restaurant/display-manager.tsx");
 assert.match(api,/code:"NO_ACTIVE_DISPLAYS",screenState/);
 assert.match(api,/SUM\(enabled=TRUE AND paused=TRUE\)/);
 assert.match(manager,/مستودع الإعلانات/);
 assert.match(manager,/campaignFilter/);
 assert.match(manager,/متاحة \(/);
 assert.match(manager,/متوقفة \(/);
 assert.match(manager,/campaignFilter==="paused"/);
 assert.match(manager,/لا توجد شاشات مؤهلة للنشر حالياً/);
 assert.match(manager,/Show campaign on displays/);
});


test("legacy TV browsers can poll and play without Fetch, URL, or WebSocket support",async()=>{
 const player=await read("app/display/[token]/display-player.tsx");
 assert.match(player,/if\(typeof window!==\"undefined\"&&typeof window\.fetch===\"function\"\)/);
 assert.match(player,/new XMLHttpRequest\(\)/);
 assert.match(player,/xhr\.open\(options\.method\|\|\"GET\",url,true\)/);
 assert.match(player,/if\(typeof window\.WebSocket!==\"function\"\)return/);
 assert.match(player,/const socketUrl=auth\.url\+separator\+\"ticket=\"\+encodeURIComponent\(auth\.ticket\)/);
 assert.doesNotMatch(player,/new URL\(auth\.url\)/);
 assert.match(player,/setInterval\(\(\)=>void load\(\)/);
});


test("TV QR pairing uses a short-lived one-time code and a hashed device token",async()=>{
 const migration=await read("migrations/0163_display_screen_pairing.sql");
 const pairing=await read("app/api/display/pairing/route.ts");
 const claim=await read("app/api/restaurant/displays/route.ts");
 const tv=await read("app/display/pair/pair-player.tsx");
 const phone=await read("app/restaurant/display-pair/display-pair-client.tsx");
 const page=await read("app/restaurant/display-pair/page.tsx");
 assert.match(migration,/display_pairing_sessions/);
 assert.match(migration,/code_hash CHAR\(64\)/);
 assert.match(migration,/token_hash CHAR\(64\)/);
 assert.match(migration,/expires_at DATETIME/);
 assert.match(pairing,/randomBytes\(32\)/);
 assert.match(pairing,/padStart\(8,"0"\)/);
 assert.match(pairing,/DATE_ADD\(UTC_TIMESTAMP\(\),INTERVAL 10 MINUTE\)/);
 assert.match(pairing,/digest\(token\)/);
 assert.match(pairing,/claimed_screen_id/);
 assert.match(claim,/action==="pairClaim"/);
 assert.match(claim,/requireTenantMembership/);
 assert.match(claim,/tenantEntitlement\(tenant,"display_advertising"\)/);
 assert.match(claim,/claimed_screen_id IS NULL LIMIT 1 FOR UPDATE/);
 assert.match(claim,/String\(sessions\[0\]\.token_hash\)/);
 assert.match(tv,/QRCode\.toDataURL/);
  assert.match(pairing,/restaurant\/display-pair\?code=/);
 assert.match(tv,/window\.location\.replace\("\/display\/"\+/);
 assert.match(phone,/action:"pairClaim"/);
 assert.match(phone,/x-foon-tenant/);
 assert.match(phone,/pairCode\.trim\(\)\.length!==8/);
 assert.match(phone,/setPairCode/);
 assert.match(page,/memberships/);
 const manager=await read("app/restaurant/display-manager.tsx");
 assert.match(manager,/display\/pair/);
});
