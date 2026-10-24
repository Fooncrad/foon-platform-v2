import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeSyncPull, authorizeSyncPush} from '../lib/platform/bidirectional-sync-authorization.mjs';

const tenantId='a1b2c3d4-e5f6-4a1b-8c2d-123456789abc';
const branchId='b1c2d3e4-f5a6-4b1c-8d2e-abcdef123456';
const actorId='c1d2e3f4-a5b6-4c1d-8e2f-abcdef123456';
const different='d1e2f3a4-b5c6-4d1e-8f2a-abcdef123456';
const context={deviceId:'11111111-1111-4111-8111-111111111111',tenantId,branchId,actorId,
 authenticated:true,revoked:false,enabled:true,suspended:false,
 expiresAt:'2099-01-01T00:00:00.000Z',grants:['sync.read','orders.write']};
const change={eventId:'22222222-2222-4222-8222-222222222222',tenantId:tenantId.toUpperCase(),
 branchId:branchId.toUpperCase(),actorId:actorId.toUpperCase(),entityId:'33333333-3333-4333-8333-333333333333',
 entityType:'order',operation:'upsert',baseVersion:0,timestamp:'2026-10-24T00:00:00.000Z',payload:{status:'pending'}};

test('pull permits casing-only UUID differences without changing requested scope',()=>{
 const result=authorizeSyncPull(context,{tenantId:tenantId.toUpperCase(),branchId:branchId.toUpperCase(),after:0,limit:100});
 assert.equal(result.tenantId,tenantId.toUpperCase());
 assert.equal(result.branchId,branchId.toUpperCase());
});
test('push permits casing-only UUID differences and preserves digest-bound bytes',()=>{
 const result=authorizeSyncPush(context,change);
 assert.equal(result.change.tenantId,tenantId.toUpperCase());
 assert.equal(result.change.actorId,actorId.toUpperCase());
});
test('pull rejects cross-tenant and cross-branch UUIDs',()=>{
 for(const scope of [{tenantId:different,branchId},{tenantId,branchId:different}])
  assert.throws(()=>authorizeSyncPull(context,scope),/SYNC_SCOPE_FORBIDDEN/);
});
test('push rejects cross-tenant, cross-branch and cross-actor UUIDs',()=>{
 for(const patch of [{tenantId:different},{branchId:different},{actorId:different}])
  assert.throws(()=>authorizeSyncPush(context,{...change,...patch}),/SYNC_SCOPE_FORBIDDEN/);
});
