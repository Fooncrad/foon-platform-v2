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
 await assert.rejects(()=>requestSyncJson({url,authorization,method:"POST",body:{events:[]},fetchImpl:async()=>response(200,"text/html",{ok:true})}),/SYNC_NON_JSON_RESPONSE/);
 await assert.rejects(()=>requestSyncJson({url,authorization,method:"POST",body:{events:[]},fetchImpl:async()=>response(302,"text/html")}),/SYNC_REDIRECT_BLOCKED/);
 await assert.rejects(()=>requestSyncJson({url,authorization,method:"POST",body:{events:[]},fetchImpl:async()=>response(200,"application/json",{ok:true},true)}),/SYNC_REDIRECT_BLOCKED/);
});
test("reject unauthorized, 5xx, malformed JSON and false success",async()=>{
 for(const code of [401,403])assert.throws(()=>validateSyncApiResponse(response(code,"application/json")) ,/SYNC_AUTH_REJECTED/);
 assert.throws(()=>validateSyncApiResponse(response(504,"application/json")),/SYNC_HTTP_504/);
 await assert.rejects(()=>requestSyncJson({url,authorization,method:"POST",body:{events:[]},fetchImpl:async()=>response(200,"application/json",{ok:false})}),/SYNC_INVALID_PAYLOAD_RESPONSE/);
 await assert.rejects(()=>requestSyncJson({url,authorization,method:"POST",body:{events:[]},fetchImpl:async()=>({...response(200,"application/json"),json:async()=>{throw Error("not json")}})}),/SYNC_MALFORMED_JSON/);
});
test("forbid external paths, URL credentials, query tokens and unsafe hosts",async()=>{
 for(const target of ["http://sync.example.com/api/sync/v1/push","https://sync.example.com/preview","https://user:pass@sync.example.com/api/sync/v1/push","https://sync.example.com/api/sync/v1/push?token=x","https://localhost/api/sync/v1/push"]){
  await assert.rejects(()=>requestSyncJson({url:target,authorization,method:"POST",body:{events:[]},fetchImpl:async()=>response(200,"application/json")}),/SYNC_(UNSAFE_ENDPOINT|UNEXPECTED_ENDPOINT|UNSAFE_QUERY)/,target);
 }
});

test("reject public API redirects and HTML without retrying against a new host",async()=>{
 let calls=0;
 for(const r of [response(307,"application/json"),response(200,"text/html")]){
  await assert.rejects(()=>requestSyncJson({url,authorization,method:"POST",body:{events:[]},fetchImpl:async()=>{calls++;return r;}}),/SYNC_(REDIRECT_BLOCKED|NON_JSON_RESPONSE)/);
 }
 assert.equal(calls,2);
});

test("pull transport accepts only exact four allowlisted query keys",async()=>{
 const base="https://sync.example.com/api/sync/v1/pull";
 const valid={tenantId:"11111111-1111-4111-8111-111111111111",branchId:"22222222-2222-4222-8222-222222222222",after:0,limit:10};
 const qs=new URLSearchParams(valid).toString();
 let sent=0;
 const fetchImpl=async()=>{sent++;return response(200,"application/json")};
 await requestSyncJson({url:base+"?"+qs,method:"GET",authorization,pullQuery:valid,fetchImpl});
 assert.equal(sent,1);
 // Previously a caller could substitute an arbitrary fourth key, including
 // a bearer token, as long as pullQuery mirrored the forged URL.
 const forged={tenantId:valid.tenantId,branchId:valid.branchId,after:0,token:"secret"};
 await assert.rejects(()=>requestSyncJson({url:base+"?"+new URLSearchParams(forged),method:"GET",authorization,pullQuery:forged,fetchImpl}),/SYNC_UNSAFE_QUERY/);
 const duplicated=base+"?tenantId="+valid.tenantId+"&tenantId="+valid.tenantId+"&branchId="+valid.branchId+"&after=0";
 await assert.rejects(()=>requestSyncJson({url:duplicated,method:"GET",authorization,pullQuery:valid,fetchImpl}),/SYNC_UNSAFE_QUERY/);
 assert.equal(sent,1,"invalid query must not reach network");
});

test("trailing-dot DNS aliases are rejected before sending bearer credentials",async()=>{
 let requests=0;
 const fetchImpl=async()=>{requests++;return response(200,"application/json")};
 for(const host of ["localhost.","dev.local.","sync.internal.","sync.example.com."]){
  await assert.rejects(
   ()=>requestSyncJson({url:`https://${host}/api/sync/v1/push`,method:"POST",authorization,body:{events:[]},fetchImpl}),
   /SYNC_UNSAFE_ENDPOINT/,
   host
  );
 }
 assert.equal(requests,0,"rejected DNS aliases must not receive credentials or network requests");
});

// An incorrect route/method pair must fail before sending the bearer token.
test("push and pull HTTP methods are pinned to their respective routes",async()=>{
 const pull="https://sync.example.com/api/sync/v1/pull";
 let requests=0;
 const fetchImpl=async()=>{requests++;return response(200,"application/json")};
 for(const input of [
  {url,method:"GET"},
  {url:pull,method:"POST",body:{change:{}}},
  {url,method:"POST"},
  {url:pull,method:"GET",body:{change:{}}},
  {url,method:"DELETE",body:{change:{}}}
 ]){
  await assert.rejects(()=>requestSyncJson({...input,authorization,fetchImpl}),/SYNC_(METHOD_ENDPOINT_MISMATCH|INVALID_METHOD|INVALID_REQUEST|UNSAFE_QUERY)/);
 }
 assert.equal(requests,0,"invalid method, endpoint or body must never reach network");
});

// A pull without its tenant, branch and cursor query must never reach the
// network with a device bearer token, even when no pullQuery was provided.
test("unscoped pull cannot send device credentials",async()=>{
 let requests=0;
 const fetchImpl=async()=>{requests++;return response(200,"application/json")};
 for(const input of [
  {url:"https://sync.example.com/api/sync/v1/pull",method:"GET"},
  {url:"https://sync.example.com/api/sync/v1/pull?",method:"GET"},
  {url:"https://sync.example.com/api/sync/v1/pull",method:"GET",pullQuery:{tenantId:"11111111-1111-4111-8111-111111111111",branchId:"22222222-2222-4222-8222-222222222222",after:0,limit:10}}
 ]){
  await assert.rejects(()=>requestSyncJson({...input,authorization,fetchImpl}),/SYNC_UNSAFE_QUERY/);
 }
 assert.equal(requests,0,"unscoped pull must not contact server");
});

// Even allowlisted keys must carry valid typed scope/cursor values before
// the Windows device bearer credential can be transmitted.
test("malformed pull scope and cursor never reach network",async()=>{
 const base="https://sync.example.com/api/sync/v1/pull";
 const valid={tenantId:"11111111-1111-4111-8111-111111111111",branchId:"22222222-2222-4222-8222-222222222222",after:0,limit:100};
 const invalid=[
  {...valid,tenantId:"not-a-uuid"},
  {...valid,branchId:"not-a-uuid"},
  {...valid,after:-1},
  {...valid,after:1.5},
  {...valid,after:"0"},
  {...valid,limit:0},
  {...valid,limit:201},
  {...valid,limit:"100"}
 ];
 let requests=0;
 const fetchImpl=async()=>{requests++;return response(200,"application/json")};
 for(const pullQuery of invalid){
  await assert.rejects(()=>requestSyncJson({url:base+"?"+new URLSearchParams(pullQuery),method:"GET",authorization,pullQuery,fetchImpl}),/SYNC_UNSAFE_QUERY/);
 }
 assert.equal(requests,0,"invalid pull requests must not transmit credentials");
 await requestSyncJson({url:base+"?"+new URLSearchParams(valid),method:"GET",authorization,pullQuery:valid,fetchImpl});
 assert.equal(requests,1,"valid pull remains usable");
});

// A caller must not bypass UUID type validation through URLSearchParams coercion.
test("pull transport rejects non-string tenant/branch UUIDs before bearer HTTP",async()=>{
 const base="https://sync.example.com/api/sync/v1/pull";
 const valid={tenantId:"11111111-1111-4111-8111-111111111111",branchId:"22222222-2222-4222-8222-222222222222",after:0,limit:100};
 let requests=0;
 const fetchImpl=async()=>{requests++;return response(200,"application/json")};
 for(const key of ["tenantId","branchId"]){
  for(const invalid of [[valid[key]],{toString:()=>valid[key]}]){
   const pullQuery={...valid,[key]:invalid};
   await assert.rejects(()=>requestSyncJson({url:base+"?"+new URLSearchParams(pullQuery),method:"GET",authorization,pullQuery,fetchImpl}),/SYNC_UNSAFE_QUERY/);
  }
 }
 assert.equal(requests,0,"malformed scope must not transmit bearer credentials");
});

test("offline sync transport provides a bounded default AbortSignal",async()=>{
 let options;
 await requestSyncJson({url,authorization,method:"POST",body:{events:[]},fetchImpl:async(_,opts)=>{options=opts;return response(200,"application/json")}});
 assert.ok(options.signal instanceof AbortSignal,"stalled HTTPS must be abortable by default");
 assert.equal(options.signal.aborted,false);
});

test("caller-supplied timeout signal is preserved for sync requests",async()=>{
 const controller=new AbortController();
 let signal;
 await requestSyncJson({url,authorization,method:"POST",body:{events:[]},timeoutSignal:controller.signal,fetchImpl:async(_,opts)=>{signal=opts.signal;return response(200,"application/json")}});
 assert.equal(signal,controller.signal);
});

// A reverse proxy can return an HTML login page or HTML outage response.
// Preserve the real HTTP status so Windows can distinguish revoked credentials
// from a temporary outage without ever accepting HTML as a successful ACK.
test("HTML authentication failures retain their 401/403 classification",async()=>{
 for(const status of [401,403]){
  await assert.rejects(()=>requestSyncJson({url,authorization,method:"POST",body:{events:[]},fetchImpl:async()=>response(status,"text/html")}),/SYNC_AUTH_REJECTED/);
 }
});
test("HTML server outage retains its 503 classification",async()=>{
 await assert.rejects(()=>requestSyncJson({url,authorization,method:"POST",body:{events:[]},fetchImpl:async()=>response(503,"text/html")}),/SYNC_HTTP_503/);
});
