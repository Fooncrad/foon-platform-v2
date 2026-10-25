import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const routes=['app/api/admin/landing-editor/route.ts','app/api/admin/pages/route.ts'];
const limit=2*1024*1024;
function compile(path,deps={}){
 const src=readFileSync(resolve(root,path),'utf8');
 const js=ts.transpileModule(src,{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',js)(name=>{
  if(Object.hasOwn(deps,name))return deps[name];
  if(name==='node:crypto')return {randomUUID:()=> '12345678-1234-1234-1234-123456789abc'};
  throw Error('Unexpected import: '+name);
 },mod,mod.exports);
 return mod.exports;
}
const {readLimitedJson}=compile('lib/security/limited-json.ts');
const fields=compile('lib/platform/landing-fields.ts');
const landing={status:'published',content:fields.emptyLandingSettings()};
const page={slug:'example',status:'published',title_ar:'عنوان',title_en:'Title',title_fr:'Titre',body_ar:'محتوى',body_en:'Body',body_fr:'Contenu'};
function handler(path,opts={}){
 const calls={writes:0,commits:0,rollbacks:0};
 const db={beginTransaction:async()=>{},execute:async()=>{calls.writes++;return [[]];},commit:async()=>{calls.commits++;},rollback:async()=>{calls.rollbacks++;},release:()=>{}};
 const deps={
  'next/server':{NextResponse:{json:(data,init)=>Response.json(data,init)}},
  '@/lib/auth/session':{currentActiveAdminUserId:async()=>opts.anonymous?null:'admin'},
  '@/lib/auth/authorization':{requirePlatformRole:async(_id,allowed)=>{if(!allowed.includes(opts.role||'super_admin'))throw Error('DENIED');}},
  '@/lib/security/origin':{assertSameOrigin:req=>{if(req.headers.get('x-cross-origin'))throw Error('DENIED');}},
  '@/lib/security/limited-json':{readLimitedJson},
  '@/lib/db/mysql':{database:()=>({getConnection:async()=>db,execute:db.execute})},
  '@/lib/platform/landing-fields':fields
 };
 return {PUT:compile(path,deps).PUT,calls};
}
function request(path,body,headers={}){
 return new Request('https://example.invalid/'+path,{method:'PUT',body:typeof body==='string'?body:JSON.stringify(body),headers});
}
function stream(path){
 const total=limit*3;let sent=0;
 const body=new ReadableStream({pull(c){if(sent===total){c.close();return;}const n=Math.min(32768,total-sent);c.enqueue(new Uint8Array(n));sent+=n;}});
 return {request:new Request('https://example.invalid/'+path,{method:'PUT',body,duplex:'half'}),get sent(){return sent;},total};
}
test('landing draft and publish preserve transactional audit writes',async()=>{
 for(const status of ['draft','published']){
  const {PUT,calls}=handler(routes[0]);
  const r=await PUT(request(routes[0],{...landing,status}));
  assert.equal(r.status,200);assert.equal(calls.commits,1);assert.equal(calls.writes,2);
 }
});
test('platform pages accept valid multilingual content',async()=>{
 const {PUT,calls}=handler(routes[1]);
 assert.equal((await PUT(request(routes[1],page))).status,200);
 assert.equal(calls.commits,1);assert.equal(calls.writes,2);
});
test('chunked oversized bodies are rejected early without writes',async()=>{
 for(const path of routes){
  const {PUT,calls}=handler(path),upload=stream(path);
  const r=await PUT(upload.request);
  assert.equal(r.status,413);assert.equal((await r.json()).code,'BODY_TOO_LARGE');
  assert.ok(upload.sent<upload.total);assert.equal(calls.writes,0);
 }
});
test('support and cross-origin writes are denied for both CMS routes',async()=>{
 for(const path of routes){
  const body=path===routes[0]?landing:page;
  assert.equal((await handler(path,{role:'support'}).PUT(request(path,body))).status,403);
  assert.equal((await handler(path).PUT(request(path,body,{'x-cross-origin':'1'}))).status,403);
 }
});
test('invalid declared length and malformed JSON fail closed',async()=>{
 for(const path of routes){
  const body=path===routes[0]?landing:page;
  assert.equal((await handler(path).PUT(request(path,body,{'content-length':String(limit+1)}))).status,413);
  assert.equal((await handler(path).PUT(request(path,body,{'content-length':'bad'}))).status,400);
  assert.equal((await handler(path).PUT(request(path,'{broken'))).status,400);
 }
});
test('both routes bind shared limited reader and preserve platform checks',()=>{
 for(const path of routes){
  const src=readFileSync(resolve(root,path),'utf8');
  assert.match(src,/readLimitedJson\((req|request),MAX_CMS_BODY_BYTES\)/);
  assert.doesNotMatch(src,/\b(req|request)\.json\(/);
  assert.match(src,/assertSameOrigin\(/);assert.match(src,/requirePlatformRole\(/);
 }
});
