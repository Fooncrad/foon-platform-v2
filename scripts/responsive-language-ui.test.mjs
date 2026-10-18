import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const globals=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
const selector=readFileSync(new URL("../app/components/language-selector.tsx",import.meta.url),"utf8");
const dashboardCss=readFileSync(new URL("../app/restaurant/merchant-dashboard.css",import.meta.url),"utf8");

test("language label is screen-reader-only across public, storefront and dashboard surfaces",()=>{
 assert.match(selector,/className="sr-only"/);
 assert.match(globals,/\.sr-only\s*\{[^}]*position:absolute!important[^}]*clip:rect\(0,0,0,0\)!important/s);
 assert.doesNotMatch(globals,/\.foonPublic\s+\.sr-only\s*\{/);
});

test("language controls and activity storefront header have compact mobile rules",()=>{
 assert.match(globals,/\.foonPublic \.foonLanguageSelector select\{[^}]*width:100px/);
 assert.match(globals,/\.foonActivityHeaderNav\{width:100%;justify-content:flex-start/);
 assert.match(dashboardCss,/\.restaurantLanguageSelector select\{min-width:100px;max-width:125px/);
 assert.match(dashboardCss,/\.restaurantTenantSelector select\{width:100%;max-width:none/);
});
