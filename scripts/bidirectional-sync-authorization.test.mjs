import test from "node:test";
import assert from "node:assert/strict";
import {authorizeSyncPush,authorizeSyncPull,validateVerifiedDeviceContext} from "../lib/platform/bidirectional-sync-authorization.mjs";
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


test("MariaDB UUID display casing does not deny a scoped order, but different identities still fail",()=>{
 const scoped={...change,tenantId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",branchId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",actorId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",entityType:"order"};
 const upper={...context,tenantId:scoped.tenantId.toUpperCase(),branchId:scoped.branchId.toUpperCase(),actorId:scoped.actorId.toUpperCase(),grants:["orders.write"]};
 assert.equal(authorizeSyncPush(upper,scoped).change.eventId,scoped.eventId);
 for(const field of ["tenantId","branchId","actorId"]){
  assert.throws(()=>authorizeSyncPush({...upper,[field]:ids[0]},scoped),/SYNC_SCOPE_FORBIDDEN/);
 }
});

test("pull accepts MariaDB UUID casing but never a different tenant, branch or missing grant",()=>{
 const tenantId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 const branchId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 const upperContext={...context,tenantId:tenantId.toUpperCase(),branchId:branchId.toUpperCase()};
 const request={tenantId,branchId,after:4,limit:10};
 assert.deepEqual(authorizeSyncPull(upperContext,request),request);
 assert.deepEqual(authorizeSyncPull({...upperContext,tenantId,branchId},{...request,tenantId:tenantId.toUpperCase(),branchId:branchId.toUpperCase()}),{...request,tenantId:tenantId.toUpperCase(),branchId:branchId.toUpperCase()});
 for(const field of ["tenantId","branchId"]){
  assert.throws(()=>authorizeSyncPull(upperContext,{...request,[field]:ids[4]}),/SYNC_SCOPE_FORBIDDEN/);
  assert.throws(()=>authorizeSyncPull(upperContext,{...request,[field]:"invalid-uuid"}),/SYNC_SCOPE_FORBIDDEN/);
 }
 assert.throws(()=>authorizeSyncPull({...upperContext,grants:[]},request),/SYNC_READ_FORBIDDEN/);
 assert.throws(()=>authorizeSyncPull({...upperContext,revoked:true},request),/SYNC_DEVICE_DISABLED/);
 assert.throws(()=>authorizeSyncPull(upperContext,{...request,after:-1}),/SYNC_INVALID_CURSOR/);
});


test("verified device context rejects coercible non-string UUIDs for every identity",()=>{
 for(const key of ["deviceId","tenantId","branchId","actorId"]){
  for(const invalid of [[context[key]],{toString(){return context[key];}},null,42]){
   assert.throws(()=>validateVerifiedDeviceContext({...context,[key]:invalid}),/SYNC_AUTH_REQUIRED/);
  }
  assert.equal(validateVerifiedDeviceContext({...context,[key]:context[key].toUpperCase()})[key],context[key].toUpperCase());
 }
});
