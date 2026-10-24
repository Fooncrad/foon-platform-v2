import test from "node:test";
import assert from "node:assert/strict";
import {digestChange} from "../lib/platform/bidirectional-sync-contract.mjs";
import {prepareSyncPullEvents} from "../lib/platform/bidirectional-sync-feed.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444","55555555-5555-4555-8555-555555555555"];
const change={eventId:ids[0],tenantId:ids[1],branchId:ids[2],actorId:ids[3],entityId:ids[4],entityType:"catalog_item",operation:"upsert",baseVersion:0,timestamp:"2026-10-22T18:00:00Z",payload:{name:"قهوة",price:12}};
const row={id:7,event_id:change.eventId,tenant_id:change.tenantId,branch_id:change.branchId,actor_id:change.actorId,source_device_id:ids[4],entity_type:change.entityType,entity_id:change.entityId,operation:change.operation,base_version:0,next_version:1,event_timestamp:change.timestamp,payload_json:JSON.stringify(change.payload),payload_digest:digestChange(change)};
const scope={tenantId:ids[1],branchId:ids[2]};
test("valid journal row converts to normalized wire event",()=>{
 const [e]=prepareSyncPullEvents([row],scope);
 assert.equal(e.tenant_id,scope.tenantId);assert.equal(e.branch_id,scope.branchId);
 assert.deepEqual(e.payload_json,change.payload);assert.equal(e.payload_digest,row.payload_digest);
});
test("rejects a cross-branch event rather than leaking",()=>{
 assert.throws(()=>prepareSyncPullEvents([{...row,branch_id:ids[3]}],scope),/SYNC_FEED_SCOPE_MISMATCH/);
});
test("rejects corrupted body, actor substitution and invalid JSON",()=>{
 assert.throws(()=>prepareSyncPullEvents([{...row,payload_json:'{"price":999}'}],scope),/SYNC_CORRUPT_JOURNAL/);
 assert.throws(()=>prepareSyncPullEvents([{...row,actor_id:ids[4]}],scope),/SYNC_CORRUPT_JOURNAL/);
 assert.throws(()=>prepareSyncPullEvents([{...row,payload_json:"{"}],scope),/SYNC_CORRUPT_PAYLOAD/);
});

test("cloud feed rejects a version jump before signing an order or reservation",()=>{
 for(const entityType of ["order","reservation","catalog_item"]){
  const candidate={...change,entityType};
  const malformed={...row,entity_type:entityType,payload_digest:digestChange(candidate),next_version:2};
  assert.throws(()=>prepareSyncPullEvents([malformed],scope),/SYNC_CORRUPT_JOURNAL_VERSION/);
 }
});

test("cloud feed rejects inventory movement using a reused entity ID",()=>{
 const movement={...change,entityType:"inventory_movement",operation:"movement",entityId:ids[4],payload:{itemId:ids[4],delta:-1}};
 const malformed={...row,entity_type:movement.entityType,entity_id:movement.entityId,operation:movement.operation,payload_json:JSON.stringify(movement.payload),payload_digest:digestChange(movement)};
 assert.throws(()=>prepareSyncPullEvents([malformed],scope),/SYNC_CORRUPT_JOURNAL_VERSION/);
 const valid={...movement,entityId:movement.eventId};
 const accepted={...malformed,entity_id:valid.entityId,payload_digest:digestChange(valid)};
 assert.equal(prepareSyncPullEvents([accepted],scope)[0].next_version,1);
});

test("signed inventory feed accepts case-only movement identity but rejects another UUID",()=>{
 const eventId="a1b2c3d4-e5f6-4a1b-8c2d-123456789abc";
 const movement={...change,eventId,entityId:eventId.toUpperCase(),entityType:"inventory_movement",operation:"movement",baseVersion:0,payload:{itemId:ids[4],delta:-1}};
 const movementRow={...row,event_id:movement.eventId,entity_id:movement.entityId,entity_type:movement.entityType,operation:movement.operation,payload_json:JSON.stringify(movement.payload),payload_digest:digestChange(movement)};
 assert.equal(prepareSyncPullEvents([movementRow],scope)[0].entity_id,movement.entityId);
 const wrong={...movement,entityId:ids[4]};
 assert.throws(()=>prepareSyncPullEvents([{...movementRow,entity_id:wrong.entityId,payload_digest:digestChange(wrong)}],scope),/SYNC_CORRUPT_JOURNAL_VERSION/);
});

test("feed rejects coerced journal cursor and source device identity before signing",()=>{
 for(const invalidId of [[7],{valueOf:()=>7},"7e0"]){
  assert.throws(()=>prepareSyncPullEvents([{...row,id:invalidId}],scope),/SYNC_FEED_SCOPE_MISMATCH/);
 }
 for(const invalidDevice of [[ids[4]],{toString:()=>ids[4]}]){
  assert.throws(()=>prepareSyncPullEvents([{...row,source_device_id:invalidDevice}],scope),/SYNC_FEED_SCOPE_MISMATCH/);
 }
 assert.equal(prepareSyncPullEvents([{...row,id:"7"}],scope)[0].id,7);
 assert.equal(prepareSyncPullEvents([{...row,source_device_id:ids[4].toUpperCase()}],scope)[0].source_device_id,ids[4].toUpperCase());
});
test("feed requires literal tenant and branch scope strings",()=>{
 for(const field of ["tenantId","branchId"]){
  const value=scope[field];
  for(const forged of [[value],{toString:()=>value,toLowerCase:()=>value.toLowerCase()}]){
   assert.throws(()=>prepareSyncPullEvents([row],{...scope,[field]:forged}),/SYNC_INVALID_FEED/);
  }
 }
});
