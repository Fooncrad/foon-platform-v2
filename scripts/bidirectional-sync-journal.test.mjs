import test from "node:test";
import assert from "node:assert/strict";
import {appendScopedChange,pullScopedChanges} from "../lib/platform/bidirectional-sync-journal.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444","55555555-5555-4555-8555-555555555555"];
const change={eventId:ids[0],tenantId:ids[1],branchId:ids[2],actorId:ids[3],entityId:ids[4],entityType:"catalog_item",operation:"upsert",baseVersion:0,timestamp:"2026-10-22T18:00:00Z",payload:{name:"test",price:12}};
test("appends event and version only through supplied transaction",async()=>{
 const queries=[];
 const db={async execute(sql,args){queries.push({sql,args});if(sql.includes("SELECT payload_digest"))return [[]];if(sql.includes("SELECT version"))return [[]];return [{affectedRows:1}]}};
 const result=await appendScopedChange(db,{change,sourceDeviceId:ids[3]});
 assert.equal(result.status,"recorded");
 assert.equal(queries.length,4);
 assert.match(queries[2].sql,/INSERT INTO foon_sync_versions/);
 assert.match(queries[3].sql,/INSERT INTO foon_sync_changes/);
});
test("repeated same event reports duplicate; tampered payload fails",async()=>{
 let digest;
 const first={async execute(sql,args){if(sql.includes("SELECT payload_digest"))return [[]];if(sql.includes("SELECT version"))return [[]];if(sql.includes("INSERT INTO foon_sync_changes"))digest=args.at(-1);return [[]]}};
 await appendScopedChange(first,{change,sourceDeviceId:ids[3]});
 const db={async execute(){return [[{payload_digest:digest}]]}};
 assert.equal((await appendScopedChange(db,{change,sourceDeviceId:ids[3]})).status,"duplicate");
 await assert.rejects(()=>appendScopedChange(db,{change:{...change,payload:{price:99}},sourceDeviceId:ids[3]}),/SYNC_IDEMPOTENCY_CONFLICT/);
});
test("pull is branch scoped, bounded and monotone",async()=>{
 const db={async execute(sql,args){assert.match(sql,/tenant_id=\? AND branch_id=\?/);assert.deepEqual(args,[ids[1],ids[2],7,100]);return [[{id:8},{id:9}]]}};
 assert.deepEqual((await pullScopedChanges(db,{tenantId:ids[1],branchId:ids[2],after:7})).nextCursor,9);
 await assert.rejects(()=>pullScopedChanges(db,{tenantId:ids[1],branchId:ids[2],after:-1}),/SYNC_INVALID_CURSOR/);
});
