import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("platform QR is placed immediately below public header",()=>{
 const source=read("app/public-site-chrome.tsx");
 assert.match(source,/<\/header><div className="foonPlatformQrStrip">/);
 assert.match(source,/<BrandedQr scope="platform"/);
});
test("restaurant and shop QR use the same themed component without displaying raw URL",()=>{
 const source=read("app/[slug]/storefront-qr.tsx"),shared=read("app/components/branded-qr.tsx");
 assert.match(source,/<BrandedQr scope="store"/);
 assert.match(shared,/scope==="platform"\?"\/":scope==="customer"\?"\/customer":"\/s\/"/);
 assert.doesNotMatch(shared,/<a href=\{base\}>/);
 assert.match(shared,/localStorage\.setItem/);
 assert.match(shared,/https:\/\/quickchart\.io\/qr/);
});

test("business and platform QR identities persist in separate database tables",()=>{
 const sql=read("migrations/0303_tenant_qr_branding.sql");
 assert.match(sql,/CREATE TABLE IF NOT EXISTS tenant_qr_branding/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS platform_qr_branding/);
 const admin=read("app/api/admin/qr-branding/route.ts");
 assert.match(admin,/requirePlatformRole/);
 assert.match(admin,/assertSameOrigin/);
 const tenant=read("app/api/restaurant/qr-branding/route.ts");
 assert.match(tenant,/requireTenantMembership/);
 assert.match(tenant,/requireAllAdditionalBranchesUnlocked/);
 const qr=read("app/components/branded-qr.tsx");
 assert.match(qr,/foonQrIdentityFrame/);
 assert.match(qr,/captionAr/);
 assert.match(qr,/platform-qr-branding/);
});
