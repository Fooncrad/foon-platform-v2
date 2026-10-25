import test from "node:test";
import assert from "node:assert/strict";
import {readLimitedJson} from "../lib/security/limited-json.ts";

const url="https://nfoodz.com/api/restaurant/assigned-service";
const make=(body,headers={})=>new Request(url,{method:"POST",body,headers});
const streamRequest=(chunkSize,chunks)=>{
 let reads=0;
 const stream=new ReadableStream({pull(controller){
  reads++;
  controller.enqueue(new Uint8Array(chunkSize));
  if(reads===chunks)controller.close();
 }});
 return {request:new Request(url,{method:"POST",body:stream,duplex:"half"}),reads:()=>reads};
};

test("waiter action JSON is accepted within the 1024-byte cap",async()=>{
 const body={tenantId:"00000000-0000-4000-8000-000000000001",callId:"00000000-0000-4000-8000-000000000002",action:"accept"};
 assert.deepEqual(await readLimitedJson(make(JSON.stringify(body)),1024),body);
});
test("service request transition JSON is accepted within the 2048-byte cap",async()=>{
 const body={id:"00000000-0000-4000-8000-000000000003",version:1,status:"completed"};
 assert.deepEqual(await readLimitedJson(make(JSON.stringify(body)),2048),body);
});
test("declared over-limit waiter body fails before parsing",async()=>{
 await assert.rejects(readLimitedJson(make("{}",{"content-length":"1025"}),1024),/BATCH_TOO_LARGE/);
});
test("chunked waiter action is stopped before the entire stream is buffered",async()=>{
 const streamed=streamRequest(400,12);
 await assert.rejects(readLimitedJson(streamed.request,1024),/BATCH_TOO_LARGE/);
 assert.ok(streamed.reads()<12);
});
test("chunked merchant service update is stopped before the entire stream is buffered",async()=>{
 const streamed=streamRequest(700,12);
 await assert.rejects(readLimitedJson(streamed.request,2048),/BATCH_TOO_LARGE/);
 assert.ok(streamed.reads()<12);
});
test("multibyte Arabic text counts bytes, not characters",async()=>{
 const json=JSON.stringify({note:"ملاحظات من العميل"});
 assert.deepEqual(await readLimitedJson(make(json),Buffer.byteLength(json)),JSON.parse(json));
 await assert.rejects(readLimitedJson(make(json),Buffer.byteLength(json)-1),/BATCH_TOO_LARGE/);
});
test("invalid declared content length is rejected",async()=>{
 await assert.rejects(readLimitedJson(make("{}",{"content-length":"garbage"}),1024),/INVALID_CONTENT_LENGTH/);
});
test("malformed or empty JSON does not become a valid action",async()=>{
 assert.equal(await readLimitedJson(make("{broken"),1024),null);
 assert.equal(await readLimitedJson(new Request(url,{method:"POST"}),1024),null);
});
