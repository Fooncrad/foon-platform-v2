import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readLimitedJson} from '../lib/security/limited-json.ts';
const url='https://nfoodz.com/api/system/client-incident';
const valid={incidentId:'WEB-0123456789AB',source:'app-error'};
const req=(value,headers={})=>new Request(url,{method:'POST',headers,body:value});

test('valid incident JSON remains readable',async()=>{
 assert.deepEqual(await readLimitedJson(req(JSON.stringify(valid)),512),valid);
});
test('declared body larger than 512 bytes is rejected before parse',async()=>{
 await assert.rejects(readLimitedJson(req('{}',{'content-length':'513'}),512),/BATCH_TOO_LARGE/);
});
test('chunked upload without Content-Length stops after exceeding 512 bytes',async()=>{
 let reads=0;
 const stream=new ReadableStream({pull(c){reads++;c.enqueue(new Uint8Array(300));if(reads===10)c.close();}});
 const request=new Request(url,{method:'POST',body:stream,duplex:'half'});
 await assert.rejects(readLimitedJson(request,512),/BATCH_TOO_LARGE/);
 assert.ok(reads<10);
});
test('UTF-8 byte length, not JavaScript character length, enforces limit',async()=>{
 const value=JSON.stringify({...valid,extra:'ع'.repeat(245)});
 assert.ok(value.length<=512 && Buffer.byteLength(value)>512);
 await assert.rejects(readLimitedJson(req(value),512),/BATCH_TOO_LARGE/);
});
test('invalid Content-Length is rejected',async()=>{
 await assert.rejects(readLimitedJson(req('{}',{'content-length':'nope'}),512),/INVALID_CONTENT_LENGTH/);
});
test('malformed JSON is safely null',async()=>{
 assert.equal(await readLimitedJson(req('{broken'),512),null);
});
test('route applies bounded reader before incident logging and retains origin/rate guards',()=>{
 const route=readFileSync(new URL('../app/api/system/client-incident/route.ts',import.meta.url),'utf8');
 assert.match(route,/assertSameOrigin\(request\)/);
 assert.match(route,/if\(!allowed\(request\)\)/);
 assert.match(route,/await readLimitedJson\(request,512\)/);
 assert.doesNotMatch(route,/request\.json\(/);
 assert.ok(route.indexOf('readLimitedJson(request,512)')<route.indexOf('logIncident({incidentId'));
 assert.match(route,/BATCH_TOO_LARGE"\?413:400/);
});
