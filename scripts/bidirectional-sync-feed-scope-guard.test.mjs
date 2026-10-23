import test from 'node:test';
import assert from 'node:assert/strict';
import {filterAuthorizedSyncEvents} from '../lib/platform/bidirectional-sync-authorization.mjs';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
const context={authenticated:true,enabled:true,revoked:false,suspended:false,expiresAt:'2099-01-01T00:00:00Z',deviceId:ids[0],tenantId:ids[1],branchId:ids[2],actorId:ids[3],grants:['sync.read','catalog.read']};
const row={entity_type:'catalog_item',tenant_id:ids[1],branch_id:ids[2],payload_json:{name:'coffee'}};
test('authorized same-tenant and same-branch catalog row passes',()=>{
 assert.deepEqual(filterAuthorizedSyncEvents(context,[row]),[row]);
});
test('foreign tenant event fails closed even with catalog.read grant',()=>{
 assert.throws(()=>filterAuthorizedSyncEvents(context,[{...row,tenant_id:ids[3]}]),/SYNC_FEED_SCOPE_MISMATCH/);
});
test('foreign branch event fails closed even with catalog.read grant',()=>{
 assert.throws(()=>filterAuthorizedSyncEvents(context,[{...row,branch_id:ids[3]}]),/SYNC_FEED_SCOPE_MISMATCH/);
});
test('missing scope is not returned as a granted event',()=>{
 assert.throws(()=>filterAuthorizedSyncEvents(context,[{entity_type:'catalog_item',payload_json:{secret:'x'}}]),/SYNC_FEED_SCOPE_MISMATCH/);
});
test('ungranted customer event stays filtered without exposing payload',()=>{
 assert.deepEqual(filterAuthorizedSyncEvents(context,[{...row,entity_type:'customer_reference',payload_json:{secret:'x'}}]),[]);
});
