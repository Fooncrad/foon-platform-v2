import test from "node:test";
import assert from "node:assert/strict";
import {requestSyncJson} from "../lib/platform/bidirectional-sync-transport.mjs";

const authorization="Bearer "+"a".repeat(64);
const endpoint="https://sync.example.com/api/sync/v1/pull";
const scope={
 tenantId:"11111111-1111-4111-8111-111111111111",
 branchId:"22222222-2222-4222-8222-222222222222",
 after:0,
 limit:100
};
const okResponse={status:200,ok:true,redirected:false,headers:{get:()=>"application/json"},json:async()=>({ok:true})};
const request=async(query)=>{
 let calls=0;
 const url=endpoint+"?"+new URLSearchParams(query).toString();
 const result=await requestSyncJson({url,authorization,pullQuery:query,fetchImpl:async()=>{calls++;return okResponse;}});
 return {result,calls};
};

test("accept exactly the four documented scoped pull parameters",async()=>{
 const {result,calls}=await request(scope);
 assert.equal(result.ok,true);
 assert.equal(calls,1);
});

test("reject four arbitrary query parameters including a token before network I/O",async()=>{
 let calls=0;
 const query={token:"EXPOSED",x:"1",y:"2",z:"3"};
 await assert.rejects(()=>requestSyncJson({
  url:endpoint+"?"+new URLSearchParams(query),authorization,pullQuery:query,
  fetchImpl:async()=>{calls++;return okResponse;}
 }),/SYNC_UNSAFE_QUERY/);
 assert.equal(calls,0);
});

test("reject a substituted token parameter in an otherwise scoped query",async()=>{
 let calls=0;
 const query={tenantId:scope.tenantId,branchId:scope.branchId,after:0,token:"SECRET"};
 await assert.rejects(()=>requestSyncJson({
  url:endpoint+"?"+new URLSearchParams(query),authorization,pullQuery:query,
  fetchImpl:async()=>{calls++;return okResponse;}
 }),/SYNC_UNSAFE_QUERY/);
 assert.equal(calls,0);
});
