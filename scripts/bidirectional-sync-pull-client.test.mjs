import test from "node:test";
import assert from "node:assert/strict";
import {requestScopedSyncPull} from "../lib/platform/bidirectional-sync-pull-client.mjs";
import {requestSyncJson} from "../lib/platform/bidirectional-sync-transport.mjs";
const scope={tenantId:"11111111-1111-4111-8111-111111111111",branchId:"22222222-2222-4222-8222-222222222222"};
const baseUrl="https://sync.example.com/api/sync/v1/pull";
const authorization="Bearer "+"a".repeat(64);
function ok(data={ok:true,events:[],nextCursor:0}){return {status:200,ok:true,redirected:false,headers:{get:()=> "application/json"},json:async()=>data}}
test("scoped pull adds only validated cursor and branch query values",async()=>{
 let received;
 const out=await requestScopedSyncPull({baseUrl,scope,after:17,limit:30,authorization,fetchImpl:async(url,opts)=>{received={url,opts};return ok()}});
 const url=new URL(received.url);
 assert.equal(url.searchParams.get("branchId"),scope.branchId);
 assert.equal(url.searchParams.get("after"),"17");
 assert.equal(url.searchParams.size,4);
 assert.equal(received.opts.method,"GET");assert.equal(out.nextCursor,0);
});
test("invalid pull cursor and injected URL query fail before transport",async()=>{
 await assert.rejects(()=>requestScopedSyncPull({baseUrl,scope,after:-1,authorization}),/SYNC_INVALID_CURSOR/);
 await assert.rejects(()=>requestScopedSyncPull({baseUrl:baseUrl+"?redirect=evil",scope,authorization}),/SYNC_UNEXPECTED_ENDPOINT/);
});
test("generic transport rejects unapproved pull query",async()=>{
 await assert.rejects(()=>requestSyncJson({url:baseUrl+"?tenantId=other",authorization,fetchImpl:async()=>ok()}),/SYNC_UNSAFE_QUERY/);
});
