import test from "node:test";
import assert from "node:assert/strict";
import {requestSyncJson,validateSyncApiResponse} from "../lib/platform/bidirectional-sync-transport.mjs";
const url="https://sync.example.com/api/sync/v1/push",authorization="Bearer "+"a".repeat(64);
const response=(status,type,payload={ok:true},redirected=false)=>({status,ok:status>=200&&status<300,redirected,headers:{get:key=>key==="content-type"?type:null},json:async()=>payload});
test("valid JSON response accepted without following redirects",async()=>{
 let options;
 const result=await requestSyncJson({url,authorization,method:"POST",body:{events:[]},fetchImpl:async(_,opts)=>{options=opts;return response(200,"application/json; charset=utf-8")}});
 assert.deepEqual(result,{ok:true});assert.equal(options.redirect,"error");assert.equal(options.headers.accept,"application/json");
});
test("Hostinger preview HTML is never treated as a sync receipt",async()=>{
 await assert.rejects(()=>requestSyncJson({url,authorization,fetchImpl:async()=>response(200,"text/html",{ok:true})}),/SYNC_NON_JSON_RESPONSE/);
 await assert.rejects(()=>requestSyncJson({url,authorization,fetchImpl:async()=>response(302,"text/html")}),/SYNC_REDIRECT_BLOCKED/);
 await assert.rejects(()=>requestSyncJson({url,authorization,fetchImpl:async()=>response(200,"application/json",{ok:true},true)}),/SYNC_REDIRECT_BLOCKED/);
});
test("reject unauthorized, 5xx, malformed JSON and false success",async()=>{
 for(const code of [401,403])assert.throws(()=>validateSyncApiResponse(response(code,"application/json")) ,/SYNC_AUTH_REJECTED/);
 assert.throws(()=>validateSyncApiResponse(response(504,"application/json")),/SYNC_HTTP_504/);
 await assert.rejects(()=>requestSyncJson({url,authorization,fetchImpl:async()=>response(200,"application/json",{ok:false})}),/SYNC_INVALID_PAYLOAD_RESPONSE/);
 await assert.rejects(()=>requestSyncJson({url,authorization,fetchImpl:async()=>({...response(200,"application/json"),json:async()=>{throw Error("not json")}})}),/SYNC_MALFORMED_JSON/);
});
test("forbid external paths, URL credentials, query tokens and unsafe hosts",async()=>{
 for(const target of ["http://sync.example.com/api/sync/v1/push","https://sync.example.com/preview","https://user:pass@sync.example.com/api/sync/v1/push","https://sync.example.com/api/sync/v1/push?token=x","https://localhost/api/sync/v1/push"]){
  await assert.rejects(()=>requestSyncJson({url:target,authorization,fetchImpl:async()=>response(200,"application/json")}),/SYNC_(UNSAFE_ENDPOINT|UNEXPECTED_ENDPOINT)/,target);
 }
});

test("reject public API redirects and HTML without retrying against a new host",async()=>{
 let calls=0;
 for(const r of [response(307,"application/json"),response(200,"text/html")]){
  await assert.rejects(()=>requestSyncJson({url,authorization,fetchImpl:async()=>{calls++;return r;}}),/SYNC_(REDIRECT_BLOCKED|NON_JSON_RESPONSE)/);
 }
 assert.equal(calls,2);
});
