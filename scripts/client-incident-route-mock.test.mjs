import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {readLimitedJson} from '../lib/security/limited-json.ts';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const path=new URL('../app/api/system/client-incident/route.ts',import.meta.url);
const source=readFileSync(path,'utf8');
const compiled=ts.transpileModule(source,{fileName:'route.ts',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function route(){
 const cjsModule={exports:{}},logged=[];
 const dependencies={
  'next/server':{NextResponse:{json:(body,options={})=>({status:options.status??200,body,headers:options.headers??{}})}},
  '@/lib/security/origin':{assertSameOrigin:request=>{if(request.headers.get('origin')!=='https://nfoodz.com')throw Error('ORIGIN_DENIED');}},
  '@/lib/security/limited-json':{readLimitedJson},
  '@/lib/platform/incidents':{logIncident:entry=>logged.push(entry)}
 };
 vm.runInNewContext(compiled,{module:cjsModule,exports:cjsModule.exports,require:id=>{
  if(!(id in dependencies))throw Error('Unexpected import '+id);
  return dependencies[id];
 },Map,Date,Number,Error,Request,URL});
 return {POST:cjsModule.exports.POST,logged};
}
const request=(body,headers={})=>new Request('https://nfoodz.com/api/system/client-incident',{method:'POST',body,headers:{origin:'https://nfoodz.com',...headers}});

test('route accepts valid incident and logs only its safe fields',async()=>{
 const {POST,logged}=route();
 const response=await POST(request(JSON.stringify({incidentId:'WEB-0123456789AB',source:'app-error'})));
 assert.equal(response.status,200);
 assert.deepEqual(JSON.parse(JSON.stringify(logged)),[{incidentId:'WEB-0123456789AB',code:'CLIENT_RENDER_ERROR',location:'app-error'}]);
});
test('route rejects oversized chunked payload without logging',async()=>{
 const {POST,logged}=route();
 const response=await POST(request(JSON.stringify({incidentId:'WEB-0123456789AB',source:'app-error',extra:'x'.repeat(1200)})));
 assert.equal(response.status,413);
 assert.equal(response.body.code,'INVALID_INPUT');
 assert.equal(logged.length,0);
});
test('route rejects malformed JSON and malformed content length',async()=>{
 const {POST}=route();
 assert.equal((await POST(request('{broken'))).status,400);
 assert.equal((await POST(request('{}',{'content-length':'NaN'}))).status,400);
});
test('route retains origin protection and per-process throttling',async()=>{
 const {POST}=route();
 const payload=JSON.stringify({incidentId:'WEB-0123456789AB',source:'global-error'});
 assert.equal((await POST(request(payload,{origin:'https://attacker.invalid'}))).status,403);
 for(let i=0;i<12;i++)assert.equal((await POST(request(payload,{'x-real-ip':'198.51.100.33'}))).status,200);
 assert.equal((await POST(request(payload,{'x-real-ip':'198.51.100.33'}))).status,429);
});
