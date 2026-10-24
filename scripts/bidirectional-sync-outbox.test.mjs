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
 const db={async execute(sql,args){if(sql.includes("state='conflict'")){assert.deepEqual(args,[ids[3],ids[1],ids[2]]);return [[]];}assert.match(sql,/ORDER BY queued_at ASC,event_id ASC/);assert.deepEqual(args,[ids[3],ids[1],ids[2],50]);return [[{event_id:ids[0],payload_digest:digestChange(change),event_payload:JSON.stringify(change)}]];}};
 const events=await readPendingSyncEvents(db,{deviceId:ids[3],tenantId:ids[1],branchId:ids[2]});
 assert.equal(events.length,1);assert.deepEqual(events[0].payload,change.payload);
});
test("corrupt pending event cannot be sent",async()=>{
 const db={async execute(sql){if(sql.includes("state='conflict'"))return [[]];return [[{event_id:ids[0],payload_digest:"a".repeat(64),event_payload:JSON.stringify(change)}]];}};
 await assert.rejects(()=>readPendingSyncEvents(db,{deviceId:ids[3],tenantId:ids[1],branchId:ids[2]}),/SYNC_OUTBOX_CORRUPT_EVENT/);
});

test("unresolved conflict blocks later pending events for the same scope",async()=>{
 const calls=[];const db={async execute(sql,args){calls.push({sql,args});if(sql.includes("state='conflict'"))return [[{event_id:ids[0]}]];throw Error("PENDING_QUERY_MUST_NOT_RUN");}};
 await assert.rejects(()=>readPendingSyncEvents(db,{deviceId:ids[3],tenantId:ids[1],branchId:ids[2]}),/SYNC_CONFLICT_REVIEW_REQUIRED/);
 assert.equal(calls.length,1);assert.deepEqual(calls[0].args,[ids[3],ids[1],ids[2]]);
});

test("mixed-case UUID scope reloads the same pending event without crossing tenants or branches",async()=>{
 const scoped={...change,eventId:"a"+ids[0].slice(1),tenantId:"b"+ids[1].slice(1),branchId:"c"+ids[2].slice(1)};
 const db={async execute(sql){
  if(sql.includes("state='conflict'"))return [[]];
  return [[{event_id:scoped.eventId.toUpperCase(),payload_digest:digestChange(scoped),event_payload:JSON.stringify(scoped)}]];
 }};
 const scope={deviceId:ids[3],tenantId:scoped.tenantId.toUpperCase(),branchId:scoped.branchId.toUpperCase()};
 assert.deepEqual((await readPendingSyncEvents(db,scope)).map(x=>x.eventId),[scoped.eventId]);
 await assert.rejects(()=>readPendingSyncEvents(db,{...scope,tenantId:ids[1]}),/SYNC_OUTBOX_CORRUPT_EVENT/);
 await assert.rejects(()=>readPendingSyncEvents(db,{...scope,branchId:ids[2]}),/SYNC_OUTBOX_CORRUPT_EVENT/);
});
test("idempotent replay accepts the same MariaDB UUID scope with different casing",async()=>{
 const scoped={...change,eventId:"a"+ids[0].slice(1),tenantId:"b"+ids[1].slice(1),branchId:"c"+ids[2].slice(1)};
 let inserts=0;
 const db={async execute(sql){
  if(!sql.startsWith("SELECT")){inserts++;return [{affectedRows:1}];}
  return [[{tenant_id:scoped.tenantId.toUpperCase(),branch_id:scoped.branchId.toUpperCase(),payload_digest:digestChange(scoped),event_payload:JSON.stringify(scoped),state:"pending"}]];
 }};
 const result=await enqueueScopedSyncEvent(db,{change:scoped,deviceId:ids[3]});
 assert.equal(result.status,"duplicate");
 assert.equal(inserts,0);
});
