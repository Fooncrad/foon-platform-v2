import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function compile(path,deps={}){
 const source=readFileSync(resolve(root,path),'utf8');
 const js=ts.transpileModule(source,{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',js)(name=>{
  if(Object.hasOwn(deps,name))return deps[name];
  throw Error('Unexpected dependency: '+name);
 },mod,mod.exports);
 return mod.exports;
}
const {readLimitedJson}=compile('lib/security/limited-json.ts');
const next={NextResponse:{json:(body,init)=>Response.json(body,init)}};
function handlers(options={}){
 const calls={write:0,connection:0,begin:0,commit:0,rollback:0,release:0,unlock:0,membership:0};
 const db={
  execute:async(sql,params)=>{calls.write++;assert.match(sql,/tenant_qr_branding/);assert.ok(params.includes('tenant-1'));return [[]];},
  getConnection:async()=>{calls.connection++;return {
   beginTransaction:async()=>{calls.begin++;},commit:async()=>{calls.commit++;},rollback:async()=>{calls.rollback++;},release:()=>{calls.release++;},
   execute:async(sql,params)=>{assert.ok(params.includes('tenant-1'));if(sql.includes('FROM tenant_business_profiles'))return [[{activity_code:options.activity??'fashion'}]];calls.write++;return [[]];}
  };}
 };
 const deps={
  'next/server':next,
  '@/lib/auth/session':{currentUserId:async()=>options.anonymous?null:'owner-1'},
  '@/lib/auth/authorization':{requireTenantMembership:async(user,tenant,roles,write)=>{calls.membership++;assert.equal(user,'owner-1');assert.deepEqual(roles,['owner','manager']);assert.equal(write,true);if(options.denied||tenant!=='tenant-1')throw Error('FORBIDDEN');return {tenantId:'tenant-1'};}},
  '@/lib/db/mysql':{database:()=>db},
  '@/lib/security/origin':{assertSameOrigin:request=>{if(request.headers.get('x-cross-origin'))throw Error('FORBIDDEN');}},
  '@/lib/security/limited-json':{readLimitedJson},
  '@/lib/restaurant/branch-pin':{requireAllAdditionalBranchesUnlocked:async()=>{calls.unlock++;if(options.locked)throw Error('BRANCH_PIN_REQUIRED');}},
  '@/lib/platform/qr-branding':{defaultQrBranding:{},parseQrBranding:input=>input&&typeof input==='object'&&input.theme==='gold'?input:null},
  '@/lib/tenant/public-controls':{PUBLIC_CONTROLS:['delivery','pickup'],normalizePublicControls:input=>input,tenantPublicControls:async()=>({delivery:true})},
 };
 return {qr:compile('app/api/restaurant/qr-branding/route.ts',deps).PUT,public:compile('app/api/restaurant/public-controls/route.ts',deps).PUT,calls};
}
function request(path,body,headers={}){return new Request('https://example.invalid/'+path,{method:'PUT',body,headers:{'x-foon-tenant':'tenant-1',...headers}});}
function chunked(path,body){
 const bytes=new TextEncoder().encode(body);let offset=0;
 const stream=new ReadableStream({pull(controller){if(offset>=bytes.length){controller.close();return;}const end=Math.min(offset+1024,bytes.length);controller.enqueue(bytes.slice(offset,end));offset=end;}});
 const req=new Request('https://example.invalid/'+path,{method:'PUT',body:stream,duplex:'half',headers:{'x-foon-tenant':'tenant-1'}});
 return {req,get consumed(){return offset;},total:bytes.length};
}
const qrPath='app/api/restaurant/qr-branding/route.ts';
const publicPath='app/api/restaurant/public-controls/route.ts';
const qrBody=JSON.stringify({settings:{theme:'gold'}});
const publicBody=JSON.stringify({controls:{delivery:false},deliveryCity:'Riyadh'});

test('QR: valid owner settings remain tenant-scoped and require branch unlock',async()=>{
 const h=handlers(),r=await h.qr(request(qrPath,qrBody));assert.equal(r.status,200);assert.equal(h.calls.write,1);assert.equal(h.calls.unlock,1);assert.equal(h.calls.membership,1);
});
test('QR: streamed oversized request fails before database write',async()=>{
 const h=handlers(),upload=chunked(qrPath,qrBody+' '.repeat(50000));const r=await h.qr(upload.req);
 assert.equal(r.status,413);assert.equal((await r.json()).code,'BODY_TOO_LARGE');assert.equal(h.calls.write,0);assert.ok(upload.consumed<upload.total);
});
test('QR: declared oversized and malformed Content-Length are rejected',async()=>{
 for(const [length,status] of [['8193',413],['invalid',400]]){const h=handlers(),r=await h.qr(request(qrPath,qrBody,{'content-length':length}));assert.equal(r.status,status);assert.equal(h.calls.write,0);}
});
test('QR: invalid JSON, forbidden origin and unauthorized tenant do not write',async()=>{
 for(const [body,headers,options,status] of [['{broken',{}, {},400],[qrBody,{'x-cross-origin':'1'},{},403],[qrBody,{}, {denied:true},403]]){
  const h=handlers(options),r=await h.qr(request(qrPath,body,headers));assert.equal(r.status,status);assert.equal(h.calls.write,0);
 }
});
test('QR: locked branch denies merchant-wide setting changes',async()=>{
 const h=handlers({locked:true}),r=await h.qr(request(qrPath,qrBody));assert.equal(r.status,403);assert.equal(h.calls.write,0);
});
test('public controls: valid owner changes commit only inside tenant',async()=>{
 const h=handlers(),r=await h.public(request(publicPath,publicBody));assert.equal(r.status,200);assert.equal(h.calls.commit,1);assert.equal(h.calls.release,1);assert.equal(h.calls.unlock,1);
});
test('public controls: streamed oversized JSON rejected before transaction',async()=>{
 const h=handlers(),upload=chunked(publicPath,publicBody+' '.repeat(50000));const r=await h.public(upload.req);
 assert.equal(r.status,413);assert.equal((await r.json()).code,'BODY_TOO_LARGE');assert.equal(h.calls.connection,0);assert.ok(upload.consumed<upload.total);
});
test('public controls: invalid length, oversized header, malformed JSON and forbidden origin fail closed',async()=>{
 for(const [body,headers,status] of [[publicBody,{'content-length':'8193'},413],[publicBody,{'content-length':'NaN'},400],['{broken',{},400],[publicBody,{'x-cross-origin':'1'},403]]){
  const h=handlers(),r=await h.public(request(publicPath,body,headers));assert.equal(r.status,status);assert.equal(h.calls.connection,0);
 }
});
test('public controls: restaurant international shipping remains prohibited',async()=>{
 const h=handlers({activity:'restaurant'}),r=await h.public(request(publicPath,JSON.stringify({requestInternational:true})));
 assert.equal(r.status,403);assert.equal((await r.json()).code,'INTERNATIONAL_NOT_ALLOWED');assert.equal(h.calls.rollback,1);assert.equal(h.calls.write,0);
});
test('public controls: denied tenant and locked PIN cannot start a transaction',async()=>{
 for(const options of [{denied:true},{locked:true}]){const h=handlers(options),r=await h.public(request(publicPath,publicBody));assert.equal(r.status,403);assert.equal(h.calls.connection,0);}
});
