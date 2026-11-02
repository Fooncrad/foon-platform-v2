import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readLimitedJson} from '../lib/security/limited-json.ts';
const endpoint='https://nfoodz.com/api/tenant/subscription-requests';
const req=(body,headers={})=>new Request(endpoint,{method:'POST',body,headers});
const source=()=>readFileSync(new URL('../app/api/tenant/subscription-requests/route.ts',import.meta.url),'utf8');
test('valid subscription request remains readable',async()=>{
 const data={tenantId:'12345678-1234-1234-1234-123456789012',planId:'12345678-1234-1234-1234-123456789013',billingCycle:'monthly',transferReference:'TRANSFER1234'};
 assert.deepEqual(await readLimitedJson(req(JSON.stringify(data)),2048),data);
});
test('declared oversized JSON is rejected',async()=>{
 await assert.rejects(readLimitedJson(req('{}',{'content-length':'2049'}),2048),/BATCH_TOO_LARGE/);
});
test('oversized chunked JSON is rejected',async()=>{
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(1025));controller.enqueue(new Uint8Array(1025));controller.close();}});
 await assert.rejects(readLimitedJson(new Request(endpoint,{method:'POST',body:stream,duplex:'half'}),2048),/BATCH_TOO_LARGE/);
});
test('malformed JSON yields null',async()=>{
 assert.equal(await readLimitedJson(req('{bad'),2048),null);
});
test('invalid content length is rejected',async()=>{
 await assert.rejects(readLimitedJson(req('{}',{'content-length':'abc'}),2048),/INVALID_CONTENT_LENGTH/);
});
test('subscription POST caps JSON and preserves owner and pending-payment checks',()=>{
 const route=source();
 assert.match(route,/readLimitedJson\(request,2048\)/);
 assert.doesNotMatch(route,/request\.json\(\)/);
 assert.match(route,/BODY_TOO_LARGE/);
 assert.match(route,/requireTenantMembership\(user,id,\["owner"\]/);
 assert.match(route,/status='active' FOR UPDATE/);
 assert.match(route,/status='pending' LIMIT 1/);
});
