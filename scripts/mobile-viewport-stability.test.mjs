import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const css=read("app/mobile-viewport-stability.css");
const root=read("app/layout.tsx");
test("mobile viewport foundation loaded after responsive rules",()=>{
 assert.ok(root.indexOf('"./mobile-viewport-stability.css"')>root.indexOf('"./site-wide-responsive-polish.css"'));
 assert.match(css,/html \{/);
 assert.match(css,/overflow-x:clip/);
 assert.match(css,/@media \(max-width:767px\)/);
 assert.match(css,/overscroll-behavior-inline:contain/);
});
test("all core mobile surfaces are guarded without overriding branding",()=>{
 for(const cls of [".auth-shell",".foonPublic",".foonPublicMarket",".publicMenu",".foonActivityStorefront",".customerDashboard",".restaurantApp",".adminShell"]){
  assert.ok(css.includes(cls),cls);
 }
 assert.doesNotMatch(css,/--(?:public-brand|activity-accent|rc-accent)\s*:/);
 assert.doesNotMatch(css,/touch-action:none|position:fixed!important|overflow-y:hidden/);
});
test("iOS inputs remain zoom-stable and checkbox accessible",()=>{
 assert.match(css,/font-size:16px/);
 assert.match(css,/input\[type="checkbox"\]/);
 assert.match(css,/min-width:18px/);
 assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length);
});
