import test from 'node:test';
import assert from 'node:assert/strict';
import {readLimitedJson} from '../lib/security/limited-json.ts';

const url = 'https://nfoodz.com/api/restaurant/catalog-import';
const request = (body, headers={}) => new Request(url, {method:'POST', body, headers});

test('valid small JSON passes without Content-Length', async () => {
  assert.deepEqual(await readLimitedJson(request('{"kind":"items","rows":[]}'), 200000), {kind:'items',rows:[]});
});
test('declared oversized Content-Length is rejected before parsing', async () => {
  await assert.rejects(readLimitedJson(request('{}', {'content-length':'200001'}), 200000), /BATCH_TOO_LARGE/);
});
test('chunked body without Content-Length is rejected at the byte limit', async () => {
  let pulled=0;
  const stream = new ReadableStream({pull(controller){pulled++;controller.enqueue(new Uint8Array(90000));if(pulled===10)controller.close();}});
  const req = new Request(url,{method:'POST',body:stream,duplex:'half'});
  await assert.rejects(readLimitedJson(req,200000),/BATCH_TOO_LARGE/);
  assert.ok(pulled<10,'oversized body must not be buffered completely');
});
test('exact byte limit succeeds and multibyte overflow fails', async () => {
  const value = JSON.stringify({name:'قهوة'});
  assert.deepEqual(await readLimitedJson(request(value),Buffer.byteLength(value)),{name:'قهوة'});
  await assert.rejects(readLimitedJson(request(value),Buffer.byteLength(value)-1),/BATCH_TOO_LARGE/);
});
test('malformed JSON and missing body are handled without throwing', async () => {
  assert.equal(await readLimitedJson(request('{broken'),200000),null);
  assert.equal(await readLimitedJson(new Request(url,{method:'POST'}),200000),null);
});
test('invalid Content-Length and limit are rejected', async () => {
  await assert.rejects(readLimitedJson(request('{}',{'content-length':'abc'}),200000),/INVALID_CONTENT_LENGTH/);
  await assert.rejects(readLimitedJson(request('{}'),0),/INVALID_BODY_LIMIT/);
});
