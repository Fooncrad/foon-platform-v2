/** Bound multipart uploads even when the client omits Content-Length (e.g. chunked requests). */
export async function readLimitedFormData(request: Request, maxBytes: number): Promise<FormData> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('INVALID_BODY_LIMIT');
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    if (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared))) throw new Error('INVALID_CONTENT_LENGTH');
    if (Number(declared) > maxBytes) throw new Error('BODY_TOO_LARGE');
  }
  if (!request.body) throw new Error('INVALID_MULTIPART');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        try { await reader.cancel(); } catch { /* reject regardless of stream cancellation */ }
        throw new Error('BODY_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  return new Request(request.url, {method: 'POST', headers, body: bytes}).formData();
}
