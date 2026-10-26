import test from 'node:test';
import assert from 'node:assert/strict';
import {readLimitedJson} from '../lib/security/limited-json.ts';

const limit=1024*1024;
const request=(body,headers={})=>new Request('https://foon.invalid/api/restaurant/operations/pos',{method:'POST',body,duplex:'half',headers});
function chunks(bytes){
 let offset=0;
 const body=new ReadableStream({pull(controller){
  if(offset>=bytes.length){controller.close();return;}
  const end=Math.min(offset+4096,bytes.length);
  controller.enqueue(bytes.subarray(offset,end));offset=end;
 }});
 return body;
}

test('accepts exactly 1 MiB of JSON without an off-by-one rejection',async()=>{
 const json='"'+'x'.repeat(limit-2)+'"';
 assert.equal(new TextEncoder().encode(json).length,limit);
 assert.equal((await readLimitedJson(request(json),limit)).length,limit-2);
});
test('a forged small Content-Length cannot bypass the streaming limit',async()=>{
 const bytes=new TextEncoder().encode('"'+'x'.repeat(limit+100)+'"');
 await assert.rejects(()=>readLimitedJson(request(chunks(bytes),{'content-length':'1'}),limit),{message:'BATCH_TOO_LARGE'});
});
test('rejects nondecimal and unsafe Content-Length values',async()=>{
 for(const value of ['-1','1.5','1e3','9007199254740993']){
  await assert.rejects(()=>readLimitedJson(request('{}',{'content-length':value}),limit),{message:'INVALID_CONTENT_LENGTH'});
 }
});
test('rejects malformed UTF-8 rather than replacing invalid bytes',async()=>{
 assert.equal(await readLimitedJson(request(chunks(new Uint8Array([0x22,0xff,0x22]))),limit),null);
});
test('counts Arabic payload size in UTF-8 bytes, not JavaScript characters',async()=>{
 const json=JSON.stringify({note:'مرحبا'});
 const bytes=new TextEncoder().encode(json).length;
 assert.deepEqual(await readLimitedJson(request(json),bytes),{note:'مرحبا'});
 await assert.rejects(()=>readLimitedJson(request(json),bytes-1),{message:'BATCH_TOO_LARGE'});
});
