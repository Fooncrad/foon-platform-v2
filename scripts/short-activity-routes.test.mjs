import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");
function pairsBetween(source,begin,end,pattern){
 const start=source.indexOf(begin);assert.notEqual(start,-1,begin+" missing");
 const finish=source.indexOf(end,start+begin.length);assert.notEqual(finish,-1,end+" missing");
 return Object.fromEntries([...source.slice(start,finish).matchAll(pattern)].map(m=>[m[1],m[2]]));
}
const aliases=pairsBetween(read("lib/tenant/workspace-routes.ts"),
 "export const ACTIVITY_ROUTE_SLUGS", "};", /([a-z]+):"([a-z-]+)"/g);
const rewrites=pairsBetween(read("next.config.mjs"),"const activityRoutes = {","};",/([a-z]+):"([a-z]+)"/g);
const db=pairsBetween(read("migrations/0101_activity_route_slugs.sql"),
 "INSERT INTO activity_route_slugs","ON DUPLICATE KEY UPDATE",/\('([a-z]+)','([a-z-]+)'\)/g);

test("activity aliases equal SQL migration rows",()=>{
 assert.equal(Object.keys(aliases).length,15);
 assert.deepEqual(db,aliases);
 assert.equal(new Set(Object.values(aliases)).size,Object.keys(aliases).length);
 const reserved=read("scripts/store-slug.mjs");
 for(const slug of Object.values(aliases))assert.match(reserved,new RegExp('"'+slug+'"'),"unreserved dashboard route "+slug);
});
test("Next redirects and rewrites use the same activity aliases",()=>{
 assert.deepEqual(Object.fromEntries(Object.entries(rewrites).map(([slug,code])=>[code,slug])),aliases);
 const config=read("next.config.mjs");
 assert.match(config,/async redirects\(/);
 assert.match(config,/async rewrites\(/);
 assert.match(config,/\/workspace\/\$\{activity\}/);
 assert.match(config,/\/\$\{slug\}\/payments/);
});
test("tenant identifiers stay server-authorized and absent from canonical navigation",()=>{
 const routes=read("lib/tenant/workspace-routes.ts");
 const merchant=read("app/restaurant/merchant-dashboard.tsx");
 const selection=read("app/api/tenant/active/route.ts");
 const resolver=read("lib/tenant/workspace.ts");
 assert.ok(routes.includes('return "/"+ACTIVITY_ROUTE_SLUGS[activity]'));
 assert.ok(merchant.includes("activitySectionUrl(data.activityCode,section)"));
 assert.ok(!merchant.includes('"/restaurant?tenant="'));
 assert.ok(selection.includes("resolveWorkspace(userId,requested)"));
 assert.ok(resolver.includes("requireTenantMembership"));
 assert.ok(selection.includes("httpOnly:true"));
});
