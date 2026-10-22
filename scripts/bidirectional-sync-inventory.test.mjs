import test from "node:test";
import assert from "node:assert/strict";
import {applyScopedInventoryMovement,validateInventoryMovement} from "../lib/platform/bidirectional-sync-inventory.mjs";
import {recordAuthorizedChange} from "../lib/platform/bidirectional-sync-service.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444","55555555-5555-4555-8555-555555555555"];
const change={eventId:ids[0],tenantId:ids[1],branchId:ids[2],actorId:ids[3],entityId:ids[0],entityType:"inventory_movement",operation:"movement",baseVersion:0,timestamp:"2026-10-22T18:00:00Z",payload:{itemId:ids[4],delta:-3}};
test("deduct exactly one scoped projection row",async()=>{
 const queries=[];
 const db={async execute(sql,args){queries.push({sql,args});if(sql.startsWith("SELECT quantity"))return [[{quantity:10}]];return [{affectedRows:1}]}};
 assert.equal(await applyScopedInventoryMovement(db,change),true);
 assert.deepEqual(queries[1].args,[7,ids[1],ids[2],ids[4],10]);
 assert.match(queries[1].sql,/tenant_id=\? AND branch_id=\? AND item_id=\?/);
});
test("reject stock underflow, unprovisioned items, unsafe delta and wrong count",async()=>{
 const base={async execute(sql){if(sql.startsWith("SELECT quantity"))return [[{quantity:2}]];return [{affectedRows:1}]}};
 await assert.rejects(()=>applyScopedInventoryMovement(base,change),/SYNC_INVENTORY_INSUFFICIENT/);
 await assert.rejects(()=>applyScopedInventoryMovement({async execute(){return [[]]}},change),/SYNC_INVENTORY_NOT_PROVISIONED/);
 assert.throws(()=>validateInventoryMovement({...change,payload:{...change.payload,delta:0}}),/SYNC_INVENTORY_INVALID_DELTA/);
 const noUpdate={async execute(sql){if(sql.startsWith("SELECT quantity"))return [[{quantity:10}]];return [{affectedRows:0}]}};
 await assert.rejects(()=>applyScopedInventoryMovement(noUpdate,change),/SYNC_INVENTORY_WRITE_CONFLICT/);
});
test("journal replay never invokes inventory projection a second time",async()=>{
 let writes=0;const db={async beginTransaction(){},async rollback(){},async commit(){throw Error("unexpected commit");},async execute(sql){
  if(sql.includes("SELECT payload_digest"))return [[{payload_digest:(await import("../lib/platform/bidirectional-sync-contract.mjs")).digestChange(change),tenant_id:ids[1],branch_id:ids[2],source_device_id:ids[4],next_version:1}]];
  return [{affectedRows:1}];
 }};
 const context={authenticated:true,enabled:true,revoked:false,suspended:false,expiresAt:"2099-01-01T00:00:00Z",deviceId:ids[4],tenantId:ids[1],branchId:ids[2],actorId:ids[3],grants:["inventory.write"]};
 const result=await recordAuthorizedChange({db,verifiedContext:context,change,applyBusinessChange:async()=>{writes++;return true;}});
 assert.equal(result.status,"duplicate");
 assert.equal(writes,0);
});
