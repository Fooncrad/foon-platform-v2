import test from "node:test";
import assert from "node:assert/strict";
import {marketPublicStorefrontUrl} from "../lib/tenant/workspace-routes.ts";
import {readFileSync} from "node:fs";
test("market visits always use the public /s route including reserved dashboard slugs",()=>{
 for(const slug of ["fashion","restaurant","customer","admin","my-shop","nasser"])assert.equal(marketPublicStorefrontUrl(slug),"/s/"+slug);
 assert.equal(marketPublicStorefrontUrl("a b"),"/s/a%20b");
});
test("market browse cards never link to a dashboard or authentication page",()=>{
 const source=readFileSync(new URL("../app/market/page.tsx",import.meta.url),"utf8");
 assert.match(source,/href=\{marketPublicStorefrontUrl\(String\(store\.slug\)\)\}/);
 assert.doesNotMatch(source,/href=\{publicStorefrontUrl\(String\(store\.slug\)\)\}/);
 const route=readFileSync(new URL("../app/s/[slug]/page.tsx",import.meta.url),"utf8");
 assert.match(route,/\[slug\]\/page/);
});
