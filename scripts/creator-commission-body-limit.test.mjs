import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {readLimitedJson} from '../lib/security/limited-json.ts';

const route=readFileSync(new URL('../app/api/admin/creator-commissions/route.ts',import.meta.url),'utf8');
const make=(text,headers={})=>new Request('https://example.test/',{method:'POST',headers,body:text});
const parse=(request)=>readLimitedJson(request,1024);

test('PUT and PATCH both call bounded actionBody after origin and role checks',()=>{
 for(const method of ['PUT','PATCH']){
  const handler=route.split(`export async function ${method}(request:Request){`)[1];
  assert.ok(handler,`${method} must exist`);
  const prefix=handler.split('const db=await database().getConnection();')[0];
  assert.match(prefix,/assertSameOrigin\(request\)/);
  assert.match(prefix,/actor\(true\)/);
  assert.match(prefix,/actionBody\(request\)/);
 }
 assert.match(route,/readLimitedJson\(request,MAX_COMMISSION_ACTION_BYTES\)/);
 assert.match(route,/MAX_COMMISSION_ACTION_BYTES=1024/);
 assert.doesNotMatch(route,/request\.(?:json|text)\(/);
});
test('valid JSON is decoded',async()=>assert.deepEqual(await parse(make('{"enabled":true,"percentage":5}')),{enabled:true,percentage:5}));
test('exact 1024-byte payload is accepted',async()=>{const raw='{"enabled":true,"percentage":5}';assert.equal((await parse(make(raw+' '.repeat(1024-Buffer.byteLength(raw))))).percentage,5);});
test('chunked upload without Content-Length is bounded by actual bytes',async()=>{
 const payload=new TextEncoder().encode('{"note":"'+'x'.repeat(3000)+'"}');
 const request=new Request('https://example.test/',{method:'POST',duplex:'half',body:new ReadableStream({start(c){c.enqueue(payload.subarray(0,600));c.enqueue(payload.subarray(600));c.close();}})});
 await assert.rejects(parse(request),/BATCH_TOO_LARGE/);
});
test('oversized declared Content-Length is rejected',async()=>await assert.rejects(parse(make('{}',{'content-length':'1025'})),/BATCH_TOO_LARGE/));
test('invalid Content-Length is rejected',async()=>await assert.rejects(parse(make('{}',{'content-length':'not-a-number'})),/INVALID_CONTENT_LENGTH/));
test('malformed JSON returns null for existing 400 validation',async()=>assert.equal(await parse(make('{bad')),null));
test('UTF-8 Arabic text is counted in bytes',async()=>await assert.rejects(parse(make(JSON.stringify({note:'ع'.repeat(600)}))),/BATCH_TOO_LARGE/));
