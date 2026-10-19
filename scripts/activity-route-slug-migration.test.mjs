import test from "node:test";
import assert from "node:assert/strict";
import {assertAvailableActivityRouteSlugs} from "./activity-route-slug-migration.mjs";

test("migration passes only if no public tenant uses an activity route",async()=>{
 let query="";
 const db={execute:async sql=>{query=sql;return [[]];}};
 assert.equal(await assertAvailableActivityRouteSlugs(db),true);
 assert.match(query,/JOIN activity_route_slugs/);
});
test("migration blocks conflicting public storefront slugs without changing tenant rows",async()=>{
 const db={execute:async()=>[[{id:"tenant-a",slug:"car"}]]};
 await assert.rejects(()=>assertAvailableActivityRouteSlugs(db),/ACTIVITY_ROUTE_SLUG_CONFLICT:car/);
});
