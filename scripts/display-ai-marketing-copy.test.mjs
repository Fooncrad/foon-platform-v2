import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("AI display copy endpoint is tenant- and entitlement-scoped",async()=>{
 const route=await read("app/api/restaurant/displays/marketing-copy/route.ts");
 assert.match(route,/assertSameOrigin/);
 assert.match(route,/currentUserId/);
 assert.match(route,/requireTenantMembership\(user,tenant,\["owner","manager"\],true\)/);
 assert.match(route,/tenantEntitlement\(tenant,"display_advertising"\)/);
 assert.match(route,/OPENAI_API_KEY/);
 assert.doesNotMatch(route,/NEXT_PUBLIC_OPENAI_API_KEY/);
});

test("AI display copy is bounded, factual, and returns structured multilingual copy",async()=>{
 const route=await read("app/api/restaurant/displays/marketing-copy/route.ts");
 assert.match(route,/readLimitedJson\(req,4096\)/);
 assert.match(route,/Never invent discounts/);
 for(const field of ["titleAr","subtitleAr","badgeAr","titleEn","subtitleEn","badgeEn","titleFr","subtitleFr","badgeFr"])assert.ok(route.includes(field),field);
 assert.match(route,/AI_NOT_CONFIGURED/);
});

test("display manager requires explicit review before saving generated copy",async()=>{
 const manager=await read("app/restaurant/display-manager.tsx");
 assert.match(manager,/marketing-copy/);
 assert.match(manager,/راجعها وعدّلها قبل النشر/);
 assert.match(manager,/subtitleAr,subtitleEn,subtitleFr/);
 assert.match(manager,/titleAr,titleEn,titleFr/);
});
