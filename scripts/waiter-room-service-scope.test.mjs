import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";

const operations=readFileSync(new URL("../lib/restaurant/operations.ts",import.meta.url),"utf8");
const rows=operations.split("export async function ordersRows(")[1]?.split("export async function createOrder(")[0];
const write=operations.split("export async function updateOrder(")[1];
test("waiter order listing is branch scoped and fails closed with no assigned table",()=>{
 assert.ok(rows,"ordersRows must exist");
 assert.match(rows,/if\(!actorUserId\|\|!branchId\)return \[\]/);
 assert.match(rows,/const tableIds=await assignedWaiterTableIds\(db,tenantId,branchId,actorUserId\)/);
 assert.match(rows,/if\(!tableIds\.length\)return \[\]/);
 assert.match(rows,/filter\+=" AND channel='dine_in' AND table_id IN \("/);
 assert.doesNotMatch(rows,/filter\+=" AND \(channel='room_service'/);
});
test("waiter cannot mutate room service or other unassigned channel orders",()=>{
 assert.ok(write,"updateOrder must exist");
 const waiter=write.split('if(role==="waiter"){')[1]?.split('if(role==="driver"){')[0];
 assert.ok(waiter,"a waiter authorization block must be present");
 assert.match(waiter,/if\(order\.channel!=="dine_in"\)throw new ResourceError\("FORBIDDEN"\)/);
 assert.match(waiter,/assignedWaiterTableIds\(db,tenantId,String\(order\.branch_id\),actor\)/);
 assert.match(waiter,/!order\.table_id\|\|!tableIds\.includes\(String\(order\.table_id\)\)/);
});
