import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const rules=read("app/site-wide-dark-mode.css");
const root=read("app/layout.tsx");
const shell=read("app/restaurant/merchant-dashboard.tsx");
const admin=read("app/admin/layout.tsx");
const customer=read("app/customer/customer-theme-shell.tsx");
const activity=read("app/[slug]/activity-storefront.tsx");
const menu=read("app/[slug]/public-menu.tsx");
const publicChrome=read("app/public-site-chrome.tsx");
const luminance=hex=>{
 const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return c[0]*.2126+c[1]*.7152+c[2]*.0722;
};
const contrast=(a,b)=>{
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};

test("the common dark palette has readable regular and secondary text",()=>{
 for(const [fg,bg] of [
  ["#f8f3e9","#242832"],["#c3ccd9","#29303b"],
  ["#f8f3e9","#303846"],["#f8f3e9","#171a20"],
  ["#ffdfa5","#433722"],["#d0e6ff","#293e59"],
  ["#c1f5dc","#234839"],["#ffced5","#532e36"],
  ["#b9c3d2","#1c212a"],["#f7b36c","#242832"]
 ]){
  assert.ok(contrast(fg,bg)>=4.5,`Text ${fg} on ${bg}: contrast ${contrast(fg,bg).toFixed(2)}:1`);
 }
});

test("dark-mode rules cover all independent site shells and account roles",()=>{
 assert.match(root,/import "\.\/site-wide-dark-mode\.css"/);
 for(const selector of [
  '.adminShell[data-theme="dark"]',
  '.restaurantApp[data-theme="dark"]',
  '.customerDashboard[data-theme="dark"]',
  '.foonPublic[data-theme="dark"]',
  '.publicMenu[data-color-mode="dark"]',
  '.foonActivityStorefront[data-color-mode="dark"]'
 ])assert.ok(rules.includes(selector),`Missing theme surface: ${selector}`);
 assert.match(shell,/data-theme=\{themeResolved\}/);
 assert.match(admin,/data-theme=\{resolved\}/);
 assert.match(customer,/data-theme=\{resolved\}/);
 assert.match(activity,/data-color-mode=\{colorMode/);
 assert.match(menu,/data-color-mode=\{mode\}/);
 assert.match(publicChrome,/data-theme=\{theme\}/);
});

test("all operational screens have a dark counterpart, not only overview",()=>{
 for(const name of [
  "restaurantOrderCards","restaurantOrderDetailsToggle",
  "restaurantPosProduct","restaurantPosCheckout",
  "restaurantPosSyncBar","restaurantOrderNotes",
  "restaurantPosInvoiceBreakdown","restaurantResourceForm",
  "calendarGrid","calendarEvent","calendarNavigation",
  "calendarSummary","calendarEditor"
 ])assert.ok(rules.includes(name),`Missing dark operation: ${name}`);
 assert.match(rules,/\[data-outside="true"\]/);
 assert.match(rules,/\[data-selected="true"\]/);
 for(const status of ["pending","confirmed","seated","completed","cancelled"]){
  assert.ok(rules.includes(`.calendarEvent[data-status="${status}"]`));
 }
});

test("styles preserve activity-specific branding, status colors and routing",()=>{
 assert.doesNotMatch(rules,/\.foonActivityStorefront\s*\{[^}]*--activity-accent:/s);
 assert.doesNotMatch(rules,/\.publicMenu\s*\{[^}]*--public-brand:/s);
 assert.doesNotMatch(rules,/tenant_id|staffPermissions|localStorage|fetch\(|router\./);
 assert.ok(!rules.includes("color:#fff!important;background:#fff"));
 assert.equal((rules.match(/\{/g)||[]).length,(rules.match(/\}/g)||[]).length);
 assert.match(rules,/@media\(prefers-reduced-motion:reduce\)/);
});
