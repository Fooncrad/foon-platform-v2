import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validAnalyticsId,validAnalyticsSlug,isLikelyRobot,visitFingerprint,visitorToken,visitorCookieName} from "../lib/analytics/public-visits.ts";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const a="123e4567-e89b-42d3-a456-426614174000",b="123e4567-e89b-42d3-a456-426614174001";
test("only valid storefront slugs and UUIDs enter analytics",()=>{
 assert.equal(validAnalyticsId(a),true);
 for(const id of ["x",a+"x","' OR 1=1",null])assert.equal(validAnalyticsId(id),false);
 assert.equal(validAnalyticsSlug("nasserc"),true);
 assert.equal(validAnalyticsSlug("a".repeat(120)),true);
 for(const slug of ["A", "", "../admin", "https://example.com","a_b"])assert.equal(validAnalyticsSlug(slug),false);
});
test("visits deduplicate per browser, subject, kind and UTC calendar day",()=>{
 const token=visitorToken(undefined);
 assert.match(token,/^[a-f0-9-]{36}$/);
 assert.equal(visitorToken(token),token);
 const first=visitFingerprint(token,"storefront",a,"2026-10-24");
 assert.equal(first,visitFingerprint(token,"storefront",a,"2026-10-24"));
 for(const alt of [
  visitFingerprint(token,"storefront",b,"2026-10-24"),
  visitFingerprint(token,"catalog_product",a,"2026-10-24"),
  visitFingerprint(token,"storefront",a,"2026-10-25"),
  visitFingerprint(visitorToken(undefined),"storefront",a,"2026-10-24")
 ])assert.notEqual(alt,first);
 assert.match(first,/^[a-f0-9]{64}$/);
});
test("tracking does not store IP, email, coordinates, user agent, or owner profile visits",()=>{
 const migration=read("migrations/0162_public_page_visit_analytics.sql");
 assert.match(migration,/CREATE TABLE IF NOT EXISTS public_page_visits/);
 assert.match(migration,/PRIMARY KEY\(target_kind,tenant_id,target_id,visit_day,visitor_hash\)/);
 assert.match(migration,/KEY ix_public_visits_tenant_day/);
 assert.doesNotMatch(migration,/\b(ip_address|email|latitude|longitude|city|user_agent)\b/i);
 const api=read("app/api/analytics/visit/route.ts");
 assert.match(api,/actor===subject/);
 assert.match(api,/FROM memberships WHERE tenant_id=/);
 assert.match(api,/INSERT IGNORE INTO public_page_visits/);
 assert.match(api,/p.visibility='public'/);
 assert.match(api,/NOT EXISTS \(SELECT 1 FROM platform_admins/);
 assert.match(api,/INVALID_ORIGIN/);
 assert.equal(visitorCookieName,"foon_public_visit");
});
test("owner stats require membership, creator analytics are visible only to self",()=>{
 const stats=read("app/api/analytics/stats/route.ts");
 assert.match(stats,/const account=await currentUserId\(\)/);
 assert.match(stats,/m\.user_id|p\.user_id=\?/);
 assert.match(stats,/role IN \('owner','manager'\)/);
 assert.match(stats,/status='active'/);
 assert.match(stats,/AND tenant_id=\?/);
 assert.match(stats,/LIMIT \? OFFSET \?/);
 assert.match(stats,/scope.*creator/);
});
test("public views capture only actual visible storefront/profile and opened product detail",()=>{
 const widget=read("app/components/public-visit-tracker.tsx");
 assert.match(widget,/navigator\.webdriver/);
 assert.match(widget,/previewTemplate/);
 const store=read("app/[slug]/page.tsx");
 const creator=read("app/creators/[handle]/page.tsx");
 const menu=read("app/[slug]/public-menu.tsx");
 const product=read("app/[slug]/activity-product-details.tsx");
 assert.match(store,/<PublicVisitTracker kind="storefront"/);
 assert.match(creator,/<PublicVisitTracker kind="creator_profile"/);
 assert.match(menu,/recordProductDetailsVisit\("restaurant_item"/);
 assert.match(product,/recordProductDetailsVisit\("catalog_product"/);
 assert.match(widget,/keepalive:true/);
});
test("each merchant sees product visits, and customer only their public creator profile visits",()=>{
 const merchant=read("app/restaurant/merchant-dashboard.tsx");
 const customer=read("app/customer/page.tsx");
 const editor=read("app/customer/creator/creator-editor.tsx");
 assert.match(merchant,/canManage&&\["overview","menu"\]\.includes\(active\)/);
 assert.match(merchant,/<MerchantVisitStats/);
 assert.match(customer,/<CreatorProfileVisitStats\/>/);
 assert.match(editor,/<CreatorProfileVisitStats\/>/);
 for(const path of ["app/restaurant/merchant-visit-stats.tsx","app/customer/creator/profile-visit-stats.tsx"]){
  assert.match(read(path),/\/api\/analytics\/stats/);
 }
});
test("robot user agents and external origin scripts are filtered",()=>{
 assert.equal(isLikelyRobot("Googlebot/2.1"),true);
 assert.equal(isLikelyRobot("Mozilla/5.0 (compatible; Lighthouse)"),true);
 assert.equal(isLikelyRobot("curl/8.4"),true);
 assert.equal(isLikelyRobot("Mozilla/5.0 Chrome/155.0.0.0 Safari/537.36"),false);
});
