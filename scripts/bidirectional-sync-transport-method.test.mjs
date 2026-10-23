import test from "node:test";
import assert from "node:assert/strict";
import {requestSyncJson} from "../lib/platform/bidirectional-sync-transport.mjs";

const authorization="Bearer "+"a".repeat(64);
const root="https://sync.example.com/api/sync/v1/";
const okResponse={status:200,ok:true,redirected:false,headers:{get:()=>"application/json"},json:async()=>({ok:true})};
const query={tenantId:"11111111-1111-4111-8111-111111111111",branchId:"22222222-2222-4222-8222-222222222222",after:0,limit:10};

test("GET must never transmit a bearer to the push endpoint",async()=>{
 let calls=0;
 await assert.rejects(()=>requestSyncJson({url:root+"push",method:"GET",authorization,fetchImpl:async()=>{calls++;return okResponse;}}),/SYNC_INVALID_METHOD/);
 assert.equal(calls,0);
});

test("POST must never transmit a bearer to the pull endpoint",async()=>{
 let calls=0;
 await assert.rejects(()=>requestSyncJson({url:root+"pull",method:"POST",body:{},authorization,fetchImpl:async()=>{calls++;return okResponse;}}),/SYNC_INVALID_METHOD/);
 assert.equal(calls,0);
});

test("legitimate POST push still works",async()=>{
 let calls=0;
 const result=await requestSyncJson({url:root+"push",method:"POST",body:{events:[]},authorization,fetchImpl:async()=>{calls++;return okResponse;}});
 assert.equal(result.ok,true);assert.equal(calls,1);
});

test("legitimate GET pull with four scoped query parameters still works",async()=>{
 let calls=0;
 const result=await requestSyncJson({url:root+"pull?"+new URLSearchParams(query),method:"GET",pullQuery:query,authorization,fetchImpl:async()=>{calls++;return okResponse;}});
 assert.equal(result.ok,true);assert.equal(calls,1);
});
