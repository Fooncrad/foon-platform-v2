// Bound push request memory even for chunked requests without Content-Length.
export const MAX_SYNC_PUSH_BODY_BYTES = 300_000;

export async function readBoundedSyncPushBody(request, maxBytes = MAX_SYNC_PUSH_BODY_BYTES) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('SYNC_INVALID_BODY_LIMIT');
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(declared) ||
        !Number.isSafeInteger(Number(declared)) || Number(declared) > maxBytes) {
      throw Error('SYNC_PAYLOAD_TOO_LARGE');
    }
  }
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      if (!(value instanceof Uint8Array)) throw Error('SYNC_INVALID_BODY_STREAM');
      if (value.byteLength > maxBytes - bytes) throw Error('SYNC_PAYLOAD_TOO_LARGE');
      bytes += value.byteLength;
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    try { await reader.cancel(); } catch { /* preserve original failure */ }
    throw error;
  } finally {
    reader.releaseLock();
  }
}
