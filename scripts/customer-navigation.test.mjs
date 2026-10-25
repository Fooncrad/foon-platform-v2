import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
import {customerNavigation,currentCustomerSection,customerSectionIds} from "../lib/ux/customer-navigation.ts";
test("customer mobile navigation uses five distinct, existing section destinations in every language",()=>{
 for(const lang of ["ar","en","fr"]){
  const sections=customerNavigation(lang);
  assert.equal(sections.length,5);
  assert.equal(new Set(sections.map(s=>s.id)).size,5);
  assert.deepEqual(sections.map(s=>s.id),customerSectionIds);
  assert(sections.every(s=>s.href==="#"+s.id&&s.label.length>0&&s.icon.length>0));
 }
});
test("current location only follows recognized customer anchors",()=>{
 assert.equal(currentCustomerSection("#customer-orders"),"customer-orders");
 assert.equal(currentCustomerSection("#customer-addresses"),"customer-addresses");
 assert.equal(currentCustomerSection("#account-settings"),"account-settings");
 for(const invalid of ["","#fake","#admin","#customer-orders?other","#customer-top-foo"])
  assert.equal(currentCustomerSection(invalid),"customer-top");
});

test("private customer command center stays scoped to authenticated accounts and real sections",()=>{
 const page=read("app/customer/page.tsx");
 const hub=read("app/customer/customer-action-hub.tsx");
 const filter=read("app/customer/customer-order-filter.tsx");
 const css=read("app/customer/customer-experience.css");
 assert.match(page,/if\(!id\)redirect\("\/login"\)/);
 assert.match(page,/isEmployeeAccount\(id\)/);
 assert.match(page,/WHERE o.customer_user_id=\?/);
 assert.match(page,/WHERE user_id=\?/);
 assert.match(page,/CustomerActionHub/);
 assert.match(page,/CustomerOrderFilter/);
 assert.match(page,/data-phase=\{orderPhase\(order.status\)\}/);
 for(const anchor of ["#customer-orders","#customer-reservations","#customer-invoices","#customer-addresses","#customer-notifications"])assert.ok(hub.includes(anchor),anchor);
 for(const label of ["ar","en","fr"])assert.ok(hub.includes('language==="'+label+'"')||label==="ar","localized "+label);
 assert.match(hub,/verified\?\{/);
 assert.match(hub,/profileComplete/);
 assert.match(hub,/new.*Notifications|unreadNotifications/);
 assert.match(hub,/This dashboard is private/);
 assert.match(filter,/aria-pressed=\{phase===option.id\}/);
 assert.match(css,/\[data-filter="active"\]/);
 assert.match(css,/\[data-filter="finished"\]/);
 assert.match(css,/\[data-filter="cancelled"\]/);
});
test("customer delivery addresses appear only in the parent section, not duplicated in profile editor",()=>{
 const page=read("app/customer/page.tsx");
 const editor=read("app/customer/profile-editor.tsx");
 assert.match(page,/<CustomerDeliveryAddresses language=\{portalLanguage\}/);
 assert.doesNotMatch(editor,/CustomerDeliveryAddresses/);
 assert.match(editor,/customerProfilePrivacyNote/);
});
test("optional public creator profile keeps privacy barriers, multilingual visitors and safe sharing",()=>{
 const publicPage=read("app/creators/[handle]/page.tsx");
 const editor=read("app/customer/creator/creator-editor.tsx");
 const share=read("app/creators/[handle]/creator-public-share.tsx");
 assert.match(publicPage,/p.visibility='public'/);
 assert.match(publicPage,/NOT EXISTS \(SELECT 1 FROM memberships/);
 assert.match(publicPage,/NOT EXISTS \(SELECT 1 FROM platform_admins/);
 assert.match(publicPage,/CreatorPublicShare/);
 assert.match(publicPage,/lang=\{language\}/);
 assert.match(editor,/visibility:"private"/);
 assert.match(editor,/creatorProfileReadiness/);
 assert.match(editor,/saved\?\.visibility==="public"/);
 assert.match(share,/navigator\.share/);
 assert.match(share,/navigator\.clipboard\.writeText/);
 assert.doesNotMatch(publicPage,/SELECT.*customer_user_id|SELECT.*restaurant_orders/);
});

test("creator public visits use public handle, verify visibility and hide visitor identities",()=>{
 const api=read("app/api/public/visits/route.ts");
 const tracker=read("app/creators/[handle]/creator-visit-tracker.tsx");
 const page=read("app/creators/[handle]/page.tsx");
 const stats=read("app/customer/creator/creator-profile-insights.tsx");
 const editor=read("app/customer/creator/creator-editor.tsx");
 const logic=read("lib/analytics/public-visits.ts");
 assert.match(api,/validCreatorHandle\(String\(body\.id\)\)/);
 assert.match(api,/p\.handle=\? AND p\.visibility='public'/);
 assert.match(api,/u\.status='active'/);
 assert.match(api,/NOT EXISTS \(SELECT 1 FROM memberships/);
 assert.match(api,/NOT EXISTS \(SELECT 1 FROM platform_admins/);
 assert.match(api,/if\(viewer===ownerUserId\)/);
 assert.match(api,/owner!==viewer/);
 assert.match(api,/countPublicVisits\("profile"/);
 assert.match(logic,/createHmac\("sha256"/);
 assert.match(logic,/INSERT IGNORE INTO public_visit_daily/);
 assert.match(tracker,/kind:"profile",id:handle/);
 assert.match(page,/CreatorVisitTracker handle=\{handle\}/);
 assert.match(editor,/CreatorProfileInsights publicProfile=\{saved.visibility==="public"\}/);
 assert.match(stats,/last7Days/);
 assert.match(stats,/last30Days/);
 assert.match(stats,/deduplicated once per visitor per day/);
 assert.doesNotMatch(stats,/visitor_hash|token_hash|x-forwarded-for/);
});

test("customer session security API never discloses tokens and only revokes owned other sessions",()=>{
 const api=read("app/api/customer/security/sessions/route.ts");
 const ui=read("app/customer/customer-security-center.tsx");
 assert.match(api,/employeePersonalAccessDenied/);
 assert.match(api,/currentUserId\(\)/);
 assert.match(api,/currentSessionId\(\)/);
 assert.match(api,/assertSameOrigin\(request\)/);
 assert.match(api,/WHERE user_id=\? AND expires_at>UTC_TIMESTAMP\(\)/);
 assert.match(api,/WHERE user_id=\? AND id=\? AND id<>\?/);
 assert.match(api,/WHERE user_id=\? AND id<>\? AND expires_at>UTC_TIMESTAMP\(\)/);
 assert.match(api,/CURRENT_SESSION_PROTECTED/);
 assert.match(api,/Cache-Control":"private, no-store"/);
 assert.doesNotMatch(api,/SELECT[^"]*token_hash/);
 assert.match(ui,/customerSecurityDanger/);
 assert.match(ui,/window\.confirm/);
 assert.match(ui,/aria-labelledby="customer-security-title"/);
});
test("FOON customer passport balances and activity timeline remain private and scoped",()=>{
 const page=read("app/customer/page.tsx");
 const wallet=read("app/customer/customer-loyalty-passport.tsx");
 const timeline=read("app/customer/customer-journey-timeline.tsx");
 const hub=read("app/customer/customer-action-hub.tsx");
 assert.match(page,/JOIN tenant_loyalty_programs p ON p\.tenant_id=t\.id AND p\.enabled=TRUE/);
 assert.match(page,/l\.user_id=c\.user_id/);
 assert.match(page,/WHERE c\.user_id=\?/);
 assert.match(page,/GROUP BY t\.id,t\.name,t\.slug,p\.min_redeem_points/);
 assert.match(page,/CUSTOMER_LOYALTY_UNAVAILABLE/);
 assert.match(page,/CustomerLoyaltyPassport/);
 assert.match(page,/CustomerJourneyTimeline/);
 assert.match(page,/CustomerSecurityCenter/);
 assert.match(page,/id=\{"customer-reservation-"/);
 assert.match(page,/id=\{"customer-service-"/);
 assert.match(timeline,/customerJourney/);
 assert.match(wallet,/Each store has separate points and redemption rules/);
 for(const a of ["#customer-security-center","#customer-journey","#customer-passport"])assert.ok(hub.includes(a),a);
 assert.doesNotMatch(read("app/creators/[handle]/page.tsx"),/customer_loyalty_ledger|auth_sessions/);
});

test("creator public visits use public handle, verify visibility and hide visitor identities",()=>{
 const api=read("app/api/public/visits/route.ts");
 const tracker=read("app/creators/[handle]/creator-visit-tracker.tsx");
 const page=read("app/creators/[handle]/page.tsx");
 const stats=read("app/customer/creator/creator-profile-insights.tsx");
 const editor=read("app/customer/creator/creator-editor.tsx");
 const logic=read("lib/analytics/public-visits.ts");
 assert.match(api,/validCreatorHandle\(String\(body\.id\)\)/);
 assert.match(api,/p\.handle=\? AND p\.visibility='public'/);
 assert.match(api,/u\.status='active'/);
 assert.match(api,/NOT EXISTS \(SELECT 1 FROM memberships/);
 assert.match(api,/NOT EXISTS \(SELECT 1 FROM platform_admins/);
 assert.match(api,/if\(viewer===ownerUserId\)/);
 assert.match(api,/owner!==viewer/);
 assert.match(api,/countPublicVisits\("profile"/);
 assert.match(logic,/createHmac\("sha256"/);
 assert.match(logic,/INSERT IGNORE INTO public_visit_daily/);
 assert.match(tracker,/kind:"profile",id:handle/);
 assert.match(page,/CreatorVisitTracker handle=\{handle\}/);
 assert.match(editor,/CreatorProfileInsights publicProfile=\{saved.visibility==="public"\}/);
 assert.match(stats,/last7Days/);
 assert.match(stats,/last30Days/);
 assert.match(stats,/deduplicated once per visitor per day/);
 assert.doesNotMatch(stats,/visitor_hash|token_hash|x-forwarded-for/);
});
