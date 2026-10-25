import test from "node:test";
import assert from "node:assert/strict";
import {applyScopedInventoryMovement,validateInventoryMovement,recordAuthorizedInventoryMovement} from "../lib/platform/bidirectional-sync-inventory.mjs";
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

test("authorized inventory entrypoint writes journal and stock together only once",async()=>{
 let quantity=8;let commits=0;let rollbacks=0;const calls=[];
 const db={
  async beginTransaction(){calls.push("begin");},
  async commit(){commits++;calls.push("commit");},
  async rollback(){rollbacks++;calls.push("rollback");},
  async execute(sql,args){
   calls.push(sql);
   if(sql.includes("SELECT payload_digest"))return [[]];
   if(sql.includes("SELECT version"))return [[]];
   if(sql.startsWith("SELECT quantity"))return [[{quantity}]];
   if(sql.startsWith("UPDATE foon_sync_inventory_projection")){assert.equal(args[0],5);quantity=5;}
   return [{affectedRows:1}];
  }
 };
 const verifiedContext={authenticated:true,enabled:true,revoked:false,suspended:false,expiresAt:"2099-01-01T00:00:00Z",deviceId:ids[4],tenantId:ids[1],branchId:ids[2],actorId:ids[3],grants:["inventory.write"]};
 const out=await recordAuthorizedInventoryMovement({db,verifiedContext,change});
 assert.equal(out.status,"recorded");assert.equal(commits,1);assert.equal(rollbacks,0);assert.equal(quantity,5);
 assert.ok(calls.findIndex(x=>x.includes("INSERT INTO foon_sync_changes"))<calls.findIndex(x=>x.startsWith("UPDATE foon_sync_inventory_projection")));
 assert.equal(calls.at(-1),"commit");
});
test("wrong branch is denied before any transaction or stock write",async()=>{
 let started=false;const db={async beginTransaction(){started=true;}};
 const verifiedContext={authenticated:true,enabled:true,revoked:false,suspended:false,expiresAt:"2099-01-01T00:00:00Z",deviceId:ids[4],tenantId:ids[1],branchId:ids[3],actorId:ids[3],grants:["inventory.write"]};
 await assert.rejects(()=>recordAuthorizedInventoryMovement({db,verifiedContext,change}),/SYNC_SCOPE_FORBIDDEN/);
 assert.equal(started,false);
});

test("movement cannot substitute a shared entity ID for unique movement event ID",()=>{
 assert.throws(()=>validateInventoryMovement({...change,entityId:ids[4]}),/SYNC_INVENTORY_EVENT_ID_MISMATCH/);
});
test("malformed projection quantities fail before any stock mutation",async()=>{
 for(const quantity of ["3.5","-2","1e3","9007199254740993",null]){
  let updated=false;
  const db={async execute(sql){
   if(sql.startsWith("SELECT quantity"))return [[{quantity}]];
   updated=true;return [{affectedRows:1}];
  }};
  await assert.rejects(()=>applyScopedInventoryMovement(db,change),/SYNC_INVENTORY_(INVALID_QUANTITY|INSUFFICIENT)/);
  assert.equal(updated,false);
 }
});

test("movement UUID casing is accepted, but foreign and malformed movement IDs are rejected",()=>{
 const eventId="a1b2c3d4-e5f6-4a1b-8c2d-123456789abc";
 const mixed={...change,eventId,entityId:eventId.toUpperCase()};
 assert.deepEqual(validateInventoryMovement(mixed),{itemId:ids[4],delta:-3});
 for(const bad of [ids[4],"not-a-uuid"]){
  assert.throws(()=>validateInventoryMovement({...mixed,entityId:bad}),/SYNC_INVENTORY_EVENT_ID_MISMATCH/);
 }
});

test("inventory item identity rejects UUID arrays and coercible objects before DB access",()=>{
 for(const invalid of [[ids[4]],{toString(){return ids[4];}},new String(ids[4]),null,123]){
  assert.throws(()=>validateInventoryMovement({...change,payload:{...change.payload,itemId:invalid}}),/SYNC_INVENTORY_ITEM_REQUIRED/);
 }
 assert.deepEqual(validateInventoryMovement(change),{itemId:ids[4],delta:-3});
});

test("movement event identities reject coercible non-strings before projection SQL",async()=>{
 const id="a1b2c3d4-e5f6-4a1b-8c2d-123456789abc";
 const valid={...change,eventId:id,entityId:id.toUpperCase()};
 let sqlCalls=0;
 const db={async execute(){sqlCalls++;throw Error("SQL_MUST_NOT_RUN");}};
 for(const field of ["eventId","entityId"]){
  for(const invalid of [[id],{toString(){return id;},toLowerCase(){return id;}},new String(id),null,123]){
   const malformed={...valid,[field]:invalid};
   assert.throws(()=>validateInventoryMovement(malformed),/SYNC_INVENTORY_EVENT_ID_MISMATCH/);
   await assert.rejects(()=>applyScopedInventoryMovement(db,malformed),/SYNC_INVENTORY_EVENT_ID_MISMATCH/);
  }
 }
 assert.equal(sqlCalls,0);
 assert.deepEqual(validateInventoryMovement(valid),{itemId:ids[4],delta:-3});
});
