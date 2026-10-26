import test from "node:test";
import assert from "node:assert/strict";
import {readBoundedSyncRequestText} from "../lib/platform/bidirectional-sync-bounded-body.mjs";
const enc=new TextEncoder();
const request=(chunks,headers={})=>new Request("https://sync.example.com/api/sync/v1/push",{
 method:"POST",headers,body:new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(typeof chunk==="string"?enc.encode(chunk):chunk);controller.close();}}),duplex:"half"
});
test("reads an ordinary JSON request within its byte limit",async()=>{
 const json='{"change":{"ok":true}}';
 assert.equal(await readBoundedSyncRequestText(request([json]),enc.encode(json).length),json);
});
test("accepts valid UTF-8 split across network chunks",async()=>{
 const euro=enc.encode('"€"');
 assert.equal(await readBoundedSyncRequestText(request([euro.subarray(0,2),euro.subarray(2)]),euro.length),'"€"');
});
test("rejects oversized chunked bodies without Content-Length",async()=>{
 await assert.rejects(()=>readBoundedSyncRequestText(request(["1234567890","1234567890"]),15),/SYNC_PAYLOAD_TOO_LARGE/);
});
test("limits UTF-8 bytes, not JavaScript character count",async()=>{
 await assert.rejects(()=>readBoundedSyncRequestText(request(["€"]),2),/SYNC_PAYLOAD_TOO_LARGE/);
});
test("rejects oversized or malformed Content-Length before reading",async()=>{
 for(const length of ["16","-1","1e2","999999999999999999999"]){
  await assert.rejects(()=>readBoundedSyncRequestText(request(["{}"],{"content-length":length}),15),/SYNC_PAYLOAD_TOO_LARGE/);
 }
});
test("rejects malformed UTF-8",async()=>{
 await assert.rejects(()=>readBoundedSyncRequestText(request([new Uint8Array([0xff])]),15),/SYNC_INVALID_BODY/);
});
test("returns empty text for a missing body",async()=>{
 const empty=new Request("https://sync.example.com/api/sync/v1/push",{method:"POST"});
 assert.equal(await readBoundedSyncRequestText(empty,15),"");
});
test("rejects an invalid size cap",async()=>{
 await assert.rejects(()=>readBoundedSyncRequestText(request(["{}"]),0),/SYNC_INVALID_BODY/);
});
