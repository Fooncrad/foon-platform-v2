import test from "node:test";
import assert from "node:assert/strict";
import {recordLocalBusinessChange} from "../lib/platform/bidirectional-sync-local-write.mjs";
import {digestChange} from "../lib/platform/bidirectional-sync-contract.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444"];
const change={eventId:ids[0],tenantId:ids[1],branchId:ids[2],actorId:ids[3],entityId:ids[0],entityType:"catalog_item",operation:"upsert",baseVersion:0,timestamp:"2026-10-22T18:00:00Z",payload:{name:"Coffee"}};
function dbFixture({existing=[],insertCount=1}={}){const calls=[];return {calls,async beginTransaction(){calls.push("begin")},async commit(){calls.push("commit")},async rollback(){calls.push("rollback")},async execute(sql){calls.push(sql);if(sql.startsWith("SELECT tenant_id,branch_id"))return [existing];if(sql.startsWith("INSERT INTO foon_sync_pending_events"))return [{affectedRows:insertCount}];throw Error("UNEXPECTED_SQL")}}}
test("outbox and business write are committed in one transaction",async()=>{
 const db=dbFixture();let applied=0;
 const result=await recordLocalBusinessChange({db,change,deviceId:ids[3],applyBusinessChange:async()=>{applied++;db.calls.push("business");return true}});
 assert.equal(result.status,"queued");assert.equal(applied,1);assert.equal(db.calls.at(-1),"commit");
 assert.ok(db.calls.indexOf("business")>db.calls.findIndex(x=>x.startsWith("INSERT INTO foon_sync_pending_events")));
});
test("failed outbox insert prevents business mutation and rolls back",async()=>{
 const db=dbFixture({insertCount:0});let applied=0;
 await assert.rejects(()=>recordLocalBusinessChange({db,change,deviceId:ids[3],applyBusinessChange:async()=>{applied++;return true}}),/SYNC_OUTBOX_ENQUEUE_FAILED/);
 assert.equal(applied,0);assert.equal(db.calls.at(-1),"rollback");
});
test("failed business mutation rolls back queued event",async()=>{
 const db=dbFixture();
 await assert.rejects(()=>recordLocalBusinessChange({db,change,deviceId:ids[3],applyBusinessChange:async()=>false}),/SYNC_BUSINESS_APPLY_UNCONFIRMED/);
 assert.equal(db.calls.at(-1),"rollback");assert.ok(!db.calls.includes("commit"));
});
test("already queued event never repeats the business mutation",async()=>{
 const db=dbFixture({existing:[{tenant_id:ids[1],branch_id:ids[2],payload_digest:digestChange(change),event_payload:JSON.stringify(change),state:"pending"}]});let writes=0;
 const result=await recordLocalBusinessChange({db,change,deviceId:ids[3],applyBusinessChange:async()=>{writes++;return true}});
 assert.equal(result.status,"duplicate");assert.equal(writes,0);assert.equal(db.calls.at(-1),"rollback");
});
