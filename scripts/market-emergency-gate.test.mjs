import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("market emergency gate runs before merchant queries, with trilingual coming-soon page",()=>{
 const page=read("app/market/page.tsx");
 assert.ok(page.indexOf("if(gate.closed)")<page.indexOf("buildMarketWhere(filters)"));
 assert.match(page,/السوق قريبًا/);assert.match(page,/Marketplace coming soon/);assert.match(page,/Le marché arrive bientôt/);
});
test("market emergency switch stays restricted to platform admins and audited",()=>{
 const route=read("app/api/admin/market-gate/route.ts");
 assert.match(route,/requirePlatformRole/);
 assert.match(route,/assertSameOrigin/);
 assert.match(route,/platform.market.closed/);
 assert.match(route,/platform.market.opened/);
 const gate=read("lib/market/global-gate.ts");
 assert.match(gate,/market_global_gate/);
 assert.match(gate,/closed:false/);
});
