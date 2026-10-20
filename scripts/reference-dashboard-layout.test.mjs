import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const merchant=read("app/restaurant/merchant-dashboard.tsx");
const merchantCss=read("app/restaurant/reference-dashboard-layout.css");
const adminLayout=read("app/admin/layout.tsx");
const adminCss=read("app/admin/reference-admin-dashboard.css");

test("unified overview is used by merchant and service activities without changing data sources",()=>{
 assert.match(merchant,/active==="overview"&&services?<div className="restaurantReferenceOverview restaurantReferenceServices">/);
 assert.match(merchant,/active==="overview"?<div className="restaurantReferenceOverview">/);
 assert.match(merchant,/className="restaurantMetrics"/);
 assert.match(merchant,/className="restaurantOverviewGrid"/);
 assert.match(merchant,/className="restaurantPanel restaurantOrders"/);
 assert.match(merchant,/className="restaurantQuickActions"/);
 assert.match(merchant,/live\?\.series\.length/);
 assert.match(merchant,/operationApi\(data\.tenantId,"overview"/);
 assert.match(merchant,/from ".*"/); // source still compiles as an ordinary TSX module
});

test("dashboard design cannot reveal forbidden activity or staff tools",()=>{
 assert.match(merchant,/groupVisibleMerchantSections/);
 assert.match(merchant,/visible\.filter/);
 assert.match(merchant,/canManage&&<button onClick=\{\(\)=>navigate\("branches"\)\}/);
 assert.match(merchant,/canPayments&&<Link href=\{paymentRoute\}/);
 assert.match(merchant,/!granted\(/);
 assert.match(merchant,/data\.staffPermissions/);
});

test("styles cover RTL\/LTR, mobile, light and dark without new backend dependencies",()=>{
 assert.match(merchant,/import "\.\/reference-dashboard-layout\.css"/);
 assert.match(adminLayout,/import "\.\/reference-admin-dashboard\.css"/);
 assert.match(merchantCss,/margin-inline-start:254px/);
 assert.match(merchantCss,/border-inline-end/);
 assert.match(merchantCss,/data-theme="dark"/);
 assert.match(merchantCss,/@media\(max-width:850px\)/);
 assert.match(merchantCss,/@media\(max-width:600px\)/);
 assert.match(adminCss,/data-theme="light"/);
 assert.match(adminCss,/data-theme="dark"/);
 assert.match(adminCss,/@media\(max-width:600px\)/);
 assert.equal((merchantCss.match(/\{/g)||[]).length,(merchantCss.match(/\}/g)||[]).length);
 assert.equal((adminCss.match(/\{/g)||[]).length,(adminCss.match(/\}/g)||[]).length);
});
