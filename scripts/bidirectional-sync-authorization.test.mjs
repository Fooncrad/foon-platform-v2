import test from "node:test";
import assert from "node:assert/strict";
import {authorizeSyncPush,authorizeSyncPull} from "../lib/platform/bidirectional-sync-authorization.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444","55555555-5555-4555-8555-555555555555"];
const context={authenticated:true,enabled:true,revoked:false,suspended:false,expiresAt:"2099-01-01T00:00:00Z",deviceId:ids[0],tenantId:ids[1],branchId:ids[2],actorId:ids[3],grants:["sync.read","catalog.write"]};
const change={eventId:ids[4],tenantId:ids[1],branchId:ids[2],actorId:ids[3],entityId:ids[0],entityType:"catalog_item",operation:"upsert",baseVersion:0,timestamp:"2026-10-22T18:00:00Z",payload:{name:"منتج"}};
test("verified device can push only granted entity and own scope",()=>{
 assert.equal(authorizeSyncPush(context,change).sourceDeviceId,ids[0]);
 for(const field of ["tenantId","branchId","actorId"])assert.throws(()=>authorizeSyncPush(context,{...change,[field]:ids[4]}),/SYNC_SCOPE_FORBIDDEN/);
 assert.throws(()=>authorizeSyncPush(context,{...change,entityType:"order"}),/SYNC_WRITE_FORBIDDEN/);
});
test("revoked, expired, disabled or unverified clients fail closed",()=>{
 for(const overrides of [{authenticated:false},{revoked:true},{enabled:false},{suspended:true},{expiresAt:"2020-01-01T00:00:00Z"}]){
  assert.throws(()=>authorizeSyncPush({...context,...overrides},change),/SYNC_DEVICE_(DISABLED|EXPIRED)/);
 }
});
test("pull checks device and branch, read grants, and cursor bounds",()=>{
 assert.deepEqual(authorizeSyncPull(context,{tenantId:ids[1],branchId:ids[2],after:4,limit:10}),{tenantId:ids[1],branchId:ids[2],after:4,limit:10});
 assert.throws(()=>authorizeSyncPull({...context,grants:[]},{tenantId:ids[1],branchId:ids[2]}),/SYNC_READ_FORBIDDEN/);
 assert.throws(()=>authorizeSyncPull(context,{tenantId:ids[1],branchId:ids[4]}),/SYNC_SCOPE_FORBIDDEN/);
 assert.throws(()=>authorizeSyncPull(context,{tenantId:ids[1],branchId:ids[2],limit:201}),/SYNC_INVALID_LIMIT/);
});
