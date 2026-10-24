import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const css=source("app/site-wide-responsive-polish.css");
const layout=source("app/layout.tsx");
const admin=source("app/admin/layout.tsx");

test("responsive foundation is loaded site-wide and preserves independent visual shells",()=>{
 assert.match(layout,/import "\.\/site-wide-responsive-polish\.css"/);
 for(const shell of [".restaurantApp",".adminShell",".customerDashboard",".foonPublic",".foonPublicMarket",".publicMenu",".foonStorefrontCart"]){
  assert.ok(css.includes(shell),`Missing UX shell: ${shell}`);
 }
 assert.ok(css.includes("min-inline-size:0"));
 assert.ok(css.includes("overflow-wrap:break-word"));
 assert.ok(css.includes("overscroll-behavior-inline:contain"));
 assert.ok(css.includes("min-block-size:44px"));
 assert.match(css,/writing-mode:horizontal-tb/);
 assert.match(css,/text-overflow:ellipsis/);
 assert.match(css,/env\(safe-area-inset-bottom/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/@media\(max-width:680px\)/);
 assert.match(css,/@media\(max-width:1023px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length);
});
test("admin and merchant top bars do not wrap locale text into columns at narrow widths",()=>{
 assert.match(css,/\.restaurantApp \.restaurantBreadcrumb small\s*\{/);
 assert.match(css,/overflow-wrap:normal/);
 assert.match(css,/\.restaurantApp:not\(\.restaurantPosFocus\) \.restaurantBreadcrumb small\{display:none\}/);
 assert.match(css,/\.restaurantApp:not\(\.restaurantPosFocus\) \.restaurantBreadcrumb\s*\{[\s\S]*?overflow:visible/);
 assert.match(css,/\.adminShell \.adminTopActions\s*\{/);
 assert.match(css,/flex-wrap:wrap!important/);
 assert.match(css,/direction:inherit!important/);
 assert.match(css,/\.foonLanguageSelector select\s*\{/);
});
test("admin media library shortcut is localized, present in both menus, and authorization unchanged",()=>{
 assert.match(admin,/\["\/admin\/media","مكتبة الصور والمساحات"\]/);
 assert.match(admin,/"مكتبة الصور والمساحات":\{en:"Media library and storage",fr:"Médiathèque et stockage"\}/);
 assert.match(admin,/aria-current=\{active\(href\)\?"page":undefined\}/);
 assert.match(admin,/event\.key==="Escape"/);
 const media=source("app/admin/media/page.tsx");
 assert.match(media,/requirePlatformRole/);
 assert.doesNotMatch(css,/tenant_id|staffPermissions|auth_sessions|localStorage|fetch\(/);
});
test("global responsiveness never changes POS fullscreen or color themes",()=>{
 assert.match(css,/\.restaurantApp:not\(\.restaurantPosFocus\)/);
 assert.doesNotMatch(css,/--(?:rc-accent|public-brand|activity-accent|foon-accent)\s*:/);
 assert.doesNotMatch(css,/(?:position|display)\s*:\s*none\s*!important/);
 assert.doesNotMatch(css,/overflow-x:hidden/);
 assert.match(css,/@media print/);
});
