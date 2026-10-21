import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const load=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const merchant=load("app/restaurant/merchant-dashboard.tsx");
const styles=load("app/restaurant/sidebar-clarity.css");
const notice=load("app/restaurant/email-verification-notice.tsx");
const verifyPage=load("app/verify-email/page.tsx");
const resendRoute=load("app/api/auth/resend-verification/route.ts");
const verifyRoute=load("app/api/auth/verify-email/route.ts");

test("all permission-filtered groups are permanently visible without folding controls",()=>{
 assert.match(merchant,/groupVisibleMerchantSections/);
 assert.match(merchant,/navGroups\.map\(group=><section/);
 assert.match(merchant,/<h2 className="restaurantNavGroupToggle">/);
 assert.match(merchant,/<div className="restaurantNavGroupItems">\{group\.items\.map/);
 assert.doesNotMatch(merchant,/collapsedNavGroups|setCollapsedNavGroups|restaurantNavChevron|restaurantNavGroupCount/);
 assert.match(merchant,/m\.feature&&!granted/);
 assert.match(merchant,/onClick=\{\(\)=>navigate\(m\.key\)\}/);
});

test("business name only appears in topbar tenant selector and not sidebar context",()=>{
 assert.doesNotMatch(merchant,/restaurantNavContext/);
 assert.match(merchant,/className="restaurantTenantSelector"/);
 assert.match(merchant,/<option value=\{data\.tenantId\}>\{data\.name\}<\/option>/);
});

test("real order counts and identifiers are readable in both themes",()=>{
 for(const selector of ["restaurantNavAttentionCount","restaurantOrderIdentity b","restaurantOrderCards header b","restaurantLiveOrders button>b"]){
  assert.ok(styles.includes(selector),selector);
 }
 assert.match(styles,/restaurantApp\[data-theme="dark"\]/);
 assert.match(styles,/font-variant-numeric:tabular-nums/);
 assert.match(styles,/color:#fff;font-weight:900/);
 assert.doesNotMatch(merchant,/restaurantNavGroupCount/);
});

test("a single notice offers verification and authenticated resend using existing safe API",()=>{
 assert.match(merchant,/!data\.emailVerified&&<EmailVerificationNotice language=\{uiLanguage\}/);
 assert.match(merchant,/import EmailVerificationNotice from "\.\/email-verification-notice"/);
 assert.match(notice,/href="\/verify-email"/);
 assert.match(notice,/fetch\("\/api\/auth\/resend-verification"/);
 assert.match(notice,/result\?\.queued\?t\.queued:t\.cooldown/);
 assert.match(notice,/result\?\.verified/);
 assert.match(resendRoute,/currentUserId\(\)/);
 assert.match(resendRoute,/verificationCooldownActive/);
 assert.match(verifyPage,/VerifyEmailActions/);
 assert.match(verifyRoute,/verificationTokenHash/);
 assert.match(verifyRoute,/used_at IS NULL AND expires_at>NOW\(\)/);
 assert.equal((styles.match(/\{/g)||[]).length,(styles.match(/\}/g)||[]).length);
});
