import test from "node:test";
import assert from "node:assert/strict";
import {offlineOnlySelected, verifyOfflineConsoleCache} from "./foon-edge-offline-policy.mjs";

const user = Object.freeze({
  username:"cashier", role:"cashier", deviceId:"device-a",
  tenantId:"tenant-a", branchId:"branch-a"
});
const NOW=1800000000000;
const valid=()=>({
  identity: {deviceId:user.deviceId,tenantId:user.tenantId,branchId:user.branchId,role:user.role},
  savedAt:new Date(NOW-3600000).toISOString(),
  validUntil:new Date(NOW+3600000).toISOString(),
  items:[],orders:[]
});

test("W27 offline mode is opt-in and rejects ambiguous flags",()=>{
  assert.equal(offlineOnlySelected(undefined),false);
  assert.equal(offlineOnlySelected("0"),false);
  assert.equal(offlineOnlySelected(""),false);
  assert.equal(offlineOnlySelected("1"),true);
  for(const value of ["true","yes","auto","2",true])
    assert.throws(()=>offlineOnlySelected(value),/W27_INVALID_OFFLINE_MODE/);
});
test("W27 accepts one already-scoped unexpired snapshot",()=>{
  assert.deepEqual(verifyOfflineConsoleCache([user],[valid()],NOW),{ready:true,devices:1});
});
test("W27 fails closed if offline enrollment/catalog is absent or expired",()=>{
  for(const list of [[],[null],[{...valid(),validUntil:new Date(NOW).toISOString()}],
    [{...valid(),savedAt:"invalid"}],
    [{...valid(),savedAt:new Date(NOW+1000).toISOString()}],
    [{...valid(),validUntil:new Date(NOW+9*3600000).toISOString()}]]){
    assert.throws(()=>verifyOfflineConsoleCache([user],list,NOW));
  }
});
test("W27 refuses cross-tenant/device/role or duplicate cached identities",()=>{
  for(const key of ["deviceId","tenantId","branchId","role"]){
    const forged=valid();forged.identity[key]="other";
    assert.throws(()=>verifyOfflineConsoleCache([user],[forged],NOW));
  }
  const another={...user,username:"kitchen",deviceId:"device-b",role:"kitchen"};
  assert.throws(()=>verifyOfflineConsoleCache([user,another],[valid(),valid()],NOW),/W27_OFFLINE_CACHE_INVALID/);
  assert.throws(()=>verifyOfflineConsoleCache([user],[{...valid(),orders:null}],NOW),/W27_OFFLINE_SCOPE_OR_CACHE_MISMATCH/);
});
