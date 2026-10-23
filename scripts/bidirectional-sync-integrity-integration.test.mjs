import test from 'node:test';
import assert from 'node:assert/strict';
import {requestSyncJson} from '../lib/platform/bidirectional-sync-transport.mjs';
import {digestChange} from '../lib/platform/bidirectional-sync-contract.mjs';
import {prepareSyncPullEvents} from '../lib/platform/bidirectional-sync-feed.mjs';

const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'];
const authorization='Bearer '+'a'.repeat(64);
const root='https://sync.example.com/api/sync/v1/';
const ok={status:200,ok:true,redirected:false,headers:{get:()=> 'application/json'},json:async()=>({ok:true})};
const change={eventId:ids[0],tenantId:ids[1],branchId:ids[2],actorId:ids[3],entityId:ids[4],entityType:'catalog_item',operation:'upsert',baseVersion:0,timestamp:'2026-10-22T18:00:00Z',payload:{name:'Coffee',price:12}};
const row={id:7,event_id:change.eventId,tenant_id:change.tenantId,branch_id:change.branchId,actor_id:change.actorId,source_device_id:ids[4],entity_type:change.entityType,entity_id:change.entityId,operation:change.operation,base_version:0,next_version:1,event_timestamp:change.timestamp,payload_json:JSON.stringify(change.payload),payload_digest:digestChange(change)};
const scope={tenantId:ids[1],branchId:ids[2]};

test('reject GET /push before sending bearer credentials',async()=>{
 let calls=0;
 await assert.rejects(()=>requestSyncJson({url:root+'push',method:'GET',authorization,fetchImpl:async()=>{calls++;return ok;}}),/SYNC_INVALID_METHOD/);
 assert.equal(calls,0);
});
test('reject POST /pull before sending bearer credentials',async()=>{
 let calls=0;
 await assert.rejects(()=>requestSyncJson({url:root+'pull',method:'POST',body:{},authorization,fetchImpl:async()=>{calls++;return ok;}}),/SYNC_INVALID_METHOD/);
 assert.equal(calls,0);
});
test('allow POST /push and GET /pull with exactly scoped query',async()=>{
 let calls=0;
 const fetchImpl=async()=>{calls++;return ok;};
 assert.deepEqual(await requestSyncJson({url:root+'push',method:'POST',body:{events:[]},authorization,fetchImpl}),{ok:true});
 const pullQuery={tenantId:ids[1],branchId:ids[2],after:0,limit:10};
 assert.deepEqual(await requestSyncJson({url:root+'pull?'+new URLSearchParams(pullQuery),method:'GET',pullQuery,authorization,fetchImpl}),{ok:true});
 assert.equal(calls,2);
});
test('reject tampered next_version even when digest and scope are valid',()=>{
 assert.throws(()=>prepareSyncPullEvents([{...row,next_version:999}],scope),/SYNC_CORRUPT_JOURNAL/);
});
test('reject a non-sequential next_version on updated entity',()=>{
 const changed={...change,baseVersion:3};
 assert.throws(()=>prepareSyncPullEvents([{...row,base_version:3,next_version:3,payload_digest:digestChange(changed)}],scope),/SYNC_CORRUPT_JOURNAL/);
});
test('accept exactly baseVersion + 1 and preserve tenant/branch',()=>{
 const changed={...change,baseVersion:3};
 const event=prepareSyncPullEvents([{...row,base_version:3,next_version:4,payload_digest:digestChange(changed)}],scope)[0];
 assert.equal(event.next_version,4);assert.equal(event.tenant_id,scope.tenantId);assert.equal(event.branch_id,scope.branchId);
});
