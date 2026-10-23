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
test("rejects a tampered next_version even with a valid unchanged payload digest",()=>{
 assert.throws(()=>prepareSyncPullEvents([{...row,next_version:999}],scope),/SYNC_CORRUPT_JOURNAL/);
});
test("rejects non-sequential stored version after a legitimate base version",()=>{
 const revised={...change,baseVersion:3};
 const revisedRow={...row,base_version:3,next_version:3,payload_digest:digestChange(revised)};
 assert.throws(()=>prepareSyncPullEvents([revisedRow],scope),/SYNC_CORRUPT_JOURNAL/);
});
test("accepts the exact next version for an updated entity",()=>{
 const revised={...change,baseVersion:3};
 const revisedRow={...row,base_version:3,next_version:4,payload_digest:digestChange(revised)};
 assert.equal(prepareSyncPullEvents([revisedRow],scope)[0].next_version,4);
});
