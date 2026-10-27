import test from "node:test";
import assert from "node:assert/strict";
import {parseScopedSyncPullQuery} from "../lib/platform/bidirectional-sync-pull-query.mjs";
const tenantId="11111111-1111-4111-8111-111111111111";
const branchId="22222222-2222-4222-8222-222222222222";
const base="https://sync.example.com/api/sync/v1/pull";
const query={tenantId,branchId,after:"0",limit:"100"};
const url=(fields=query)=>base+"?"+new URLSearchParams(fields);
const rejects=target=>assert.throws(()=>parseScopedSyncPullQuery(target),/SYNC_INVALID_QUERY/);
test("accepts an explicit scoped cursor and returns typed integers",()=>{
 assert.deepEqual(parseScopedSyncPullQuery(url()),{tenantId,branchId,after:0,limit:100});
 assert.deepEqual(parseScopedSyncPullQuery(url({limit:"200",after:"12",branchId,tenantId})),{tenantId,branchId,after:12,limit:200});
});
test("rejects absent and ambiguous scope/cursor fields",()=>{
 rejects(base);
 for(const key of Object.keys(query)){
  const missing={...query};delete missing[key];rejects(url(missing));
  rejects(url()+"&"+key+"="+encodeURIComponent(query[key]));
 }
});
test("rejects unknown query keys including token parameters",()=>{
 rejects(url()+"&token=secret");
 rejects(url()+"&debug=1");
});
test("rejects malformed tenant and branch UUIDs",()=>{
 rejects(url({...query,tenantId:"not-a-uuid"}));
 rejects(url({...query,branchId:"../other-branch"}));
 rejects(url({...query,tenantId:""}));
});
test("rejects coerced, signed, fractional, and noncanonical cursors",()=>{
 for(const after of ["","-1","+1","01","1e2","1.0"," 1 ","NaN","Infinity","9007199254740992"]){
  rejects(url({...query,after}));
 }
});
test("rejects invalid limits and integer overflow",()=>{
 for(const limit of ["","0","201","-1","01","1e2","1.5","9007199254740992"]){
  rejects(url({...query,limit}));
 }
});
test("rejects malformed URL",()=>rejects("not a URL"));
test("accepts case-varied UUIDs without altering identity bytes",()=>{
 const mixed={...query,tenantId:tenantId.toUpperCase(),branchId:branchId.toUpperCase()};
 assert.deepEqual(parseScopedSyncPullQuery(url(mixed)),{tenantId:mixed.tenantId,branchId:mixed.branchId,after:0,limit:100});
});
