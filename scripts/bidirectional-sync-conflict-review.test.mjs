import test from "node:test";
import assert from "node:assert/strict";
import {listScopedSyncConflicts} from "../lib/platform/bidirectional-sync-conflict-review.mjs";
import {digestChange} from "../lib/platform/bidirectional-sync-contract.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444"];
const change={eventId:ids[0],tenantId:ids[1],branchId:ids[2],actorId:ids[3],entityId:ids[0],entityType:"order",operation:"upsert",baseVersion:2,timestamp:"2026-10-23T00:00:00Z",payload:{customerEmail:"private@example.com"}};
const scope={deviceId:ids[3],tenantId:ids[1],branchId:ids[2]};
function fixture(rows){const calls=[];return {calls,async execute(sql,args){calls.push({sql,args});return [rows]}}}
test("conflict review returns only metadata and enforces device/branch filter",async()=>{
 const db=fixture([{event_id:ids[0],payload_digest:digestChange(change),event_payload:JSON.stringify(change),updated_at:"2026-10-23T00:00:00Z"}]);
 const result=await listScopedSyncConflicts(db,scope);
 assert.equal(result[0].status,"conflict");assert.equal(result[0].entityType,"order");
 assert.equal(JSON.stringify(result).includes("private@example.com"),false);
 assert.equal(Object.hasOwn(result[0],"entityId"),false);
 assert.match(db.calls[0].sql,/state='conflict'/);
 assert.deepEqual(db.calls[0].args,[ids[3],ids[1],ids[2],50]);
});
test("tampered conflict payload must not be displayed as trustworthy",async()=>{
 const db=fixture([{event_id:ids[0],payload_digest:"0".repeat(64),event_payload:JSON.stringify(change)}]);
 await assert.rejects(()=>listScopedSyncConflicts(db,scope),/SYNC_CONFLICT_EVENT_CORRUPT/);
});
test("invalid scope never queries database",async()=>{
 const db=fixture([]);
 await assert.rejects(()=>listScopedSyncConflicts(db,{...scope,branchId:"another-branch"}),/SYNC_INVALID_CONFLICT_SCOPE/);
 assert.deepEqual(db.calls,[]);
});

test("conflict review accepts UUID casing differences without exposing order payload",async()=>{
 const alpha=["a1b2c3d4-e5f6-4a1b-8c2d-123456789abc","b1b2c3d4-e5f6-4a1b-8c2d-123456789abc","c1b2c3d4-e5f6-4a1b-8c2d-123456789abc"];
 const mixed={...change,eventId:alpha[0].toUpperCase(),tenantId:alpha[1].toUpperCase(),branchId:alpha[2].toUpperCase()};
 const mixedScope={...scope,tenantId:alpha[1],branchId:alpha[2]};
 const db=fixture([{event_id:alpha[0],payload_digest:digestChange(mixed),event_payload:JSON.stringify(mixed),updated_at:"2026-10-23T00:00:00Z"}]);
 const rows=await listScopedSyncConflicts(db,mixedScope);
 assert.equal(rows.length,1);
 assert.equal(rows[0].eventId,mixed.eventId);
 assert.equal(rows[0].entityType,"order");
 assert.equal(JSON.stringify(rows).includes("private@example.com"),false);
});
test("conflict review rejects foreign UUIDs and coerced event IDs",async()=>{
 for(const overrides of [{event_id:ids[3]},{event_id:[ids[0]]},{tenantId:ids[3]},{branchId:ids[3]}]){
  const stored={...change,...(overrides.tenantId?{tenantId:overrides.tenantId}:{}),...(overrides.branchId?{branchId:overrides.branchId}:{})};
  const db=fixture([{event_id:overrides.event_id??ids[0],payload_digest:digestChange(stored),event_payload:JSON.stringify(stored),updated_at:"2026-10-23T00:00:00Z"}]);
  await assert.rejects(()=>listScopedSyncConflicts(db,scope),/SYNC_CONFLICT_EVENT_CORRUPT/);
 }
});
