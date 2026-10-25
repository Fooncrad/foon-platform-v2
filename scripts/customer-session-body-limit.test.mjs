import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readLimitedJson} from '../lib/security/limited-json.ts';

const endpoint='https://nfoodz.com/api/customer/security/sessions';
const request=(body,headers={})=>new Request(endpoint,{method:'DELETE',body,headers});

test('small revoke request preserves UUID field',async()=>{
 const id='12345678-1234-1234-1234-123456789abc';
 assert.deepEqual(await readLimitedJson(request(JSON.stringify({id})),1024),{id});
});
test('allOthers revoke request remains supported',async()=>{
 assert.deepEqual(await readLimitedJson(request('{"allOthers":true}'),1024),{allOthers:true});
});
test('declared body over 1024 bytes is rejected before parsing',async()=>{
 await assert.rejects(readLimitedJson(request('{}',{'content-length':'1025'}),1024),/BATCH_TOO_LARGE/);
});
test('chunked body without Content-Length is bounded',async()=>{
 let pulls=0;
 const stream=new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(800));if(pulls===8)controller.close();}});
 const req=new Request(endpoint,{method:'DELETE',body:stream,duplex:'half'});
 await assert.rejects(readLimitedJson(req,1024),/BATCH_TOO_LARGE/);
 assert.ok(pulls<8,'should not buffer the full oversized request');
});
test('multibyte UTF-8 size is checked as bytes',async()=>{
 const json=JSON.stringify({note:'ع'.repeat(600)});
 await assert.rejects(readLimitedJson(request(json),1024),/BATCH_TOO_LARGE/);
});
test('malformed or missing body yields null',async()=>{
 assert.equal(await readLimitedJson(request('{broken'),1024),null);
 assert.equal(await readLimitedJson(new Request(endpoint,{method:'DELETE'}),1024),null);
});
test('session route uses bounded parser, preserves account scope and no-store',()=>{
 const route=readFileSync(new URL('../app/api/customer/security/sessions/route.ts',import.meta.url),'utf8');
 assert.match(route,/await readLimitedJson\(request,1024\)/);
 assert.doesNotMatch(route,/request\.json\(\)/);
 assert.match(route,/BODY_TOO_LARGE/);
 assert.match(route,/WHERE user_id=\? AND id=\? AND id<>\?/);
 assert.match(route,/status='active'/);
 assert.match(route,/Cache-Control.*no-store/);
});
