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
