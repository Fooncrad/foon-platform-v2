import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=path=>readFileSync(resolve(root,path),'utf8');
const compiled=ts.transpileModule(source('lib/security/limited-json.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function('module','exports',compiled)(mod,mod.exports);
const {readLimitedJson}=mod.exports;
function streamRequest(value,chunkSize=1024){
 const bytes=new TextEncoder().encode(value);let offset=0;
 const stream=new ReadableStream({pull(controller){if(offset>=bytes.length){controller.close();return;}const end=Math.min(offset+chunkSize,bytes.length);controller.enqueue(bytes.slice(offset,end));offset=end;}});
 return {request:new Request('https://example.invalid/api/customer/orders',{method:'POST',body:stream,duplex:'half'}),get consumed(){return offset;},total:bytes.length};
}
test('customer checkout uses bounded JSON before opening DB connections',()=>{
 for(const [file,limit] of [['app/api/customer/orders/route.ts','1024*1024']]){
  const code=source(file);
  assert.match(code,/import \{readLimitedJson\} from "@\/lib\/security\/limited-json"/);
  assert.ok(code.indexOf(`readLimitedJson(request,${limit})`)>0);
  assert.ok(code.indexOf(`readLimitedJson(request,${limit})`)<code.indexOf('const db=await database().getConnection()',code.indexOf('export async function POST')));
  assert.doesNotMatch(code.slice(code.indexOf('export async function POST')),/request\.json\(/);
  assert.match(code,/"BODY_TOO_LARGE"/);
 }
});
test('streaming overflow stops before consuming a large upload',async()=>{
 const upload=streamRequest(JSON.stringify({notes:'x'.repeat(200000)}));
 await assert.rejects(readLimitedJson(upload.request,8192),/BATCH_TOO_LARGE/);
 assert.ok(upload.consumed<upload.total);
});
test('declared oversized and malformed Content-Length are rejected',async()=>{
 for(const [header,error] of [['8193','BATCH_TOO_LARGE'],['nope','INVALID_CONTENT_LENGTH']]){
  const request=new Request('https://example.invalid/',{method:'POST',body:'{}',headers:{'content-length':header}});
  await assert.rejects(readLimitedJson(request,8192),new RegExp(error));
 }
});
test('byte limits count Arabic UTF-8 rather than JavaScript string length',async()=>{
 const text=JSON.stringify({notes:'ع'.repeat(5000)});
 assert.ok(text.length<8192);
 await assert.rejects(readLimitedJson(streamRequest(text).request,8192),/BATCH_TOO_LARGE/);
});
test('valid JSON is accepted and invalid JSON returns null',async()=>{
 assert.deepEqual(await readLimitedJson(streamRequest('{"ok":true}').request,8192),{ok:true});
 assert.equal(await readLimitedJson(streamRequest('{broken').request,8192),null);
});
test('JSON payload exactly at 1 MiB is accepted by the bounded reader',async()=>{
 const limit=1024*1024;
 const base='{"notes":""}';
 const body='{"notes":"'+'x'.repeat(limit-Buffer.byteLength(base))+'"}';
 assert.equal(Buffer.byteLength(body),limit);
 const parsed=await readLimitedJson(streamRequest(body,4096).request,limit);
 assert.equal(parsed.notes.length,limit-Buffer.byteLength(base));
});
