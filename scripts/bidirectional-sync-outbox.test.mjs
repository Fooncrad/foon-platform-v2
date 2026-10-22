import test from "node:test";
import assert from "node:assert/strict";
import {enqueueScopedSyncEvent,readPendingSyncEvents} from "../lib/platform/bidirectional-sync-outbox.mjs";
import {digestChange} from "../lib/platform/bidirectional-sync-contract.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444"];
const change={eventId:ids[0],tenantId:ids[1],branchId:ids[2],actorId:ids[3],entityId:ids[0],entityType:"catalog_item",operation:"upsert",baseVersion:0,timestamp:"2026-10-22T18:00:00Z",payload:{name:"coffee"}};
test("new scoped event is queued with deterministic digest",async()=>{
 const calls=[];const db={async execute(sql,args){calls.push({sql,args});return sql.startsWith("SELECT")?[[]]:[{affectedRows:1}]}};
 const out=await enqueueScopedSyncEvent(db,{change,deviceId:ids[3]});
 assert.equal(out.status,"queued");assert.equal(out.digest,digestChange(change));
 assert.deepEqual(calls.at(-1).args,[ids[3],ids[0],ids[1],ids[2],digestChange(change),JSON.stringify(change)]);
});
test("same event replay never enqueues duplicate",async()=>{
 let inserts=0;const db={async execute(sql){if(sql.startsWith("SELECT"))return [[{tenant_id:ids[1],branch_id:ids[2],payload_digest:digestChange(change),event_payload:JSON.stringify(change),state:"pending"}]];inserts++;return [{affectedRows:1}]}};
 const result=await enqueueScopedSyncEvent(db,{change,deviceId:ids[3]});
 assert.equal(result.status,"duplicate");assert.equal(inserts,0);
});
test("same event ID with mismatched body fails closed",async()=>{
 const db={async execute(){return [[{tenant_id:ids[1],branch_id:ids[2],payload_digest:"b".repeat(64),state:"pending"}]]}};
 await assert.rejects(()=>enqueueScopedSyncEvent(db,{change,deviceId:ids[3]}),/SYNC_OUTBOX_IDEMPOTENCY_CONFLICT/);
});
test("failed enqueue cannot report success",async()=>{
 const db={async execute(sql){return sql.startsWith("SELECT")?[[]]:[{affectedRows:0}]}};
 await assert.rejects(()=>enqueueScopedSyncEvent(db,{change,deviceId:ids[3]}),/SYNC_OUTBOX_ENQUEUE_FAILED/);
});

test("pending events can be reloaded after restart and verified before network delivery",async()=>{
 const db={async execute(sql,args){assert.match(sql,/ORDER BY queued_at ASC,event_id ASC/);assert.deepEqual(args,[ids[3],ids[1],ids[2],50]);return [[{event_id:ids[0],payload_digest:digestChange(change),event_payload:JSON.stringify(change)}]];}};
 const events=await readPendingSyncEvents(db,{deviceId:ids[3],tenantId:ids[1],branchId:ids[2]});
 assert.equal(events.length,1);assert.deepEqual(events[0].payload,change.payload);
});
test("corrupt pending event cannot be sent",async()=>{
 const db={async execute(){return [[{event_id:ids[0],payload_digest:"a".repeat(64),event_payload:JSON.stringify(change)}]];}};
 await assert.rejects(()=>readPendingSyncEvents(db,{deviceId:ids[3],tenantId:ids[1],branchId:ids[2]}),/SYNC_OUTBOX_CORRUPT_EVENT/);
});
