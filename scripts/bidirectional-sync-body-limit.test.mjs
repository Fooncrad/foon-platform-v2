import test from 'node:test';
import assert from 'node:assert/strict';
import { readBoundedSyncPushBody, MAX_SYNC_PUSH_BODY_BYTES } from '../lib/platform/bidirectional-sync-body-limit.mjs';

function streamedRequest(chunks, headers = {}) {
  let index = 0;
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      if (index >= chunks.length) return controller.close();
      controller.enqueue(chunks[index++]);
    },
    cancel() { cancelled = true; }
  }, { highWaterMark: 0 });
  return { request: { headers: new Headers(headers), body }, get cancelled() { return cancelled; }, get readCount() { return index; } };
}
const bytes = text => new TextEncoder().encode(text);

test('accepts normal chunked JSON without Content-Length', async () => {
  const item = streamedRequest([bytes('{"change":'), bytes('{"a":1}}')]);
  assert.equal(await readBoundedSyncPushBody(item.request), '{"change":{"a":1}}');
});
test('rejects an oversized chunked body before reading all chunks', async () => {
  const item = streamedRequest([new Uint8Array(150_000), new Uint8Array(150_001), bytes('never read')]);
  await assert.rejects(readBoundedSyncPushBody(item.request), /SYNC_PAYLOAD_TOO_LARGE/);
  assert.equal(item.cancelled, true);
  assert.ok(item.readCount < 3);
});
test('oversized body rejects promptly even if stream cancellation never settles', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(MAX_SYNC_PUSH_BODY_BYTES + 1)); },
    cancel() { cancelled = true; return new Promise(() => {}); }
  }, { highWaterMark: 0 });
  let timer;
  try {
    const outcome = await Promise.race([
      readBoundedSyncPushBody({ headers: new Headers(), body }).then(
        () => 'UNEXPECTED_SUCCESS', error => error.message
      ),
      new Promise(resolve => { timer = setTimeout(() => resolve('HUNG_CANCEL'), 200); })
    ]);
    assert.equal(outcome, 'SYNC_PAYLOAD_TOO_LARGE');
    assert.equal(cancelled, true);
  } finally { clearTimeout(timer); }
});

test('rejects oversized declared Content-Length before consuming body', async () => {
  const item = streamedRequest([bytes('safe')], { 'content-length': String(MAX_SYNC_PUSH_BODY_BYTES + 1) });
  await assert.rejects(readBoundedSyncPushBody(item.request), /SYNC_PAYLOAD_TOO_LARGE/);
  assert.equal(item.readCount, 0);
});
test('rejects noncanonical and unsafe declared lengths', async () => {
  for (const length of ['-1', '01', 'Infinity', '9007199254740993', 'abc']) {
    const item = streamedRequest([bytes('safe')], { 'content-length': length });
    await assert.rejects(readBoundedSyncPushBody(item.request), /SYNC_PAYLOAD_TOO_LARGE/);
    assert.equal(item.readCount, 0);
  }
});
test('accepts exact byte limit, rejects one byte over', async () => {
  const exact = streamedRequest([new Uint8Array(300_000)]);
  assert.equal((await readBoundedSyncPushBody(exact.request)).length, 300_000);
  const extra = streamedRequest([new Uint8Array(300_000), new Uint8Array(1)]);
  await assert.rejects(readBoundedSyncPushBody(extra.request), /SYNC_PAYLOAD_TOO_LARGE/);
});
test('preserves UTF-8 characters split across chunks', async () => {
  const utf8 = bytes('🙂');
  const item = streamedRequest([utf8.subarray(0,2), utf8.subarray(2)]);
  assert.equal(await readBoundedSyncPushBody(item.request), '🙂');
});
test('accepts no body as empty string', async () => {
  assert.equal(await readBoundedSyncPushBody({headers:new Headers(),body:null}), '');
});
test('rejects invalid max byte limit', async () => {
  await assert.rejects(readBoundedSyncPushBody({headers:new Headers(),body:null}, -1), /SYNC_INVALID_BODY_LIMIT/);
});

test('push route checks bounded stream before database acquisition (source-order check)', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../app/api/sync/v1/push/route.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('readBoundedSyncPushBody(request)'));
  assert.ok(source.indexOf('readBoundedSyncPushBody(request)') < source.indexOf('database().getConnection()'));
  assert.ok(!source.includes('request.text()'));
});
