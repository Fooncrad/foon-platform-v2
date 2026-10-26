import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const merchant=read("app/restaurant/merchant-dashboard.tsx");
const merchantShellCss=read("app/restaurant/merchant-dashboard.css");
const merchantCss=read("app/restaurant/reference-dashboard-layout.css");
const adminLayout=read("app/admin/layout.tsx");
const adminCss=read("app/admin/reference-admin-dashboard.css");

test("unified overview is used by merchant and service activities without changing data sources",()=>{
 assert.match(merchant,/active==="overview"&&services\?<div className="restaurantReferenceOverview restaurantReferenceServices">/);
 assert.match(merchant,/active==="overview"\?<div className="restaurantReferenceOverview">/);
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


test("merchant topbar keeps translated workspace title horizontal when controls wrap",()=>{
 assert.match(merchant,/uiLanguage==="fr"\?"Espace de travail"/);
 const selector=".restaurantApp .restaurantBreadcrumb small{";
 const ruleStart=merchantShellCss.lastIndexOf(selector);
 assert.ok(ruleStart>=0,"breadcrumb CSS override is present");
 const rule=merchantShellCss.slice(ruleStart,merchantShellCss.indexOf("}",ruleStart)+1);
 for(const style of ["white-space:nowrap","overflow-wrap:normal","word-break:normal","writing-mode:horizontal-tb","text-overflow:ellipsis"]){
  assert.ok(rule.includes(style),"missing breadcrumb rule: "+style);
 }
 assert.match(merchantShellCss,/\.restaurantApp:not\(\.restaurantPosFocus\) \.restaurantTopbar\{\s*flex-wrap:wrap/);
 assert.match(merchantShellCss,/\.restaurantApp:not\(\.restaurantPosFocus\) \.restaurantTopActions\{[^}]*flex-wrap:wrap/s);
 assert.match(merchantShellCss,/@media \(max-width:1023px\)/);
 assert.match(merchantShellCss,/@media \(max-width:680px\)/);
 assert.equal((merchantShellCss.match(/\{/g)||[]).length,(merchantShellCss.match(/\}/g)||[]).length);
});
