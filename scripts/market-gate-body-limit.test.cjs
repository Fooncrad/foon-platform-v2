/* eslint-disable @typescript-eslint/no-require-imports -- standalone route-handler regression test */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(relative, mocks={}){
  const source=fs.readFileSync(path.join(root,relative),'utf8');
  const compiled=ts.transpileModule(source,{fileName:relative,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  assert.equal(compiled.diagnostics?.length||0,0);
  const mod={exports:{}};
  new Function('require','module','exports',compiled.outputText)(name=>{
    if(Object.prototype.hasOwnProperty.call(mocks,name))return mocks[name];
    throw Error('Unexpected import '+name);
  },mod,mod.exports);
  return mod.exports;
}
const {readLimitedJson}=load('lib/security/limited-json.ts');
const gate=load('lib/market/global-gate.ts',{'@/lib/db/mysql':{database:()=>({execute:async()=>[[]]})}});
function setup({role='super_admin',user='admin',originValid=true,failDb=false}={}){
  const calls={connection:0,writes:[],commits:0,rollbacks:0};
  const connection={beginTransaction:async()=>{},execute:async(sql,params)=>{calls.writes.push({sql,params});if(failDb)throw Error('db failure');return [[]];},commit:async()=>{calls.commits++},rollback:async()=>{calls.rollbacks++},release:()=>{}};
  const mocks={
    'next/server':{NextResponse:{json:(body,opts={})=>({status:opts.status||200,body,headers:opts.headers||{}})}},
    '@/lib/auth/session':{currentActiveAdminUserId:async()=>user},
    '@/lib/auth/authorization':{requirePlatformRole:async(_id,roles)=>{if(!roles.includes(role))throw Error('forbidden')}},
    '@/lib/security/origin':{assertSameOrigin:()=>{if(!originValid)throw Error('bad origin')}},
    '@/lib/security/limited-json':{readLimitedJson},
    '@/lib/db/mysql':{database:()=>({getConnection:async()=>{calls.connection++;return connection}})},
    '@/lib/market/global-gate':gate
  };
  const route='app/api/admin/market-gate/route.ts';
  return {...load(route,mocks),calls};
}
const valid={settings:{closed:true,reason:{ar:'السوق مغلق مؤقتًا',en:'Marketplace temporarily closed',fr:'Marché temporairement fermé'}}};
function req(body,headers={}){return new Request('https://example.invalid/api/admin/market-gate',{method:'PUT',body:typeof body==='string'?body:JSON.stringify(body),headers});}
function chunked(n){let produced=0;const stream=new ReadableStream({pull(controller){if(produced>=n){controller.close();return}const size=Math.min(1024,n-produced);controller.enqueue(new Uint8Array(size).fill(65));produced+=size;}});return {request:new Request('https://example.invalid/api/admin/market-gate',{method:'PUT',body:stream,duplex:'half'}),sent:()=>produced};}
test('valid admin close writes setting and audit in transaction',async()=>{
  const s=setup();const r=await s.PUT(req(valid));assert.equal(r.status,200);assert.equal(r.body.settings.closed,true);
  assert.equal(s.calls.connection,1);assert.equal(s.calls.writes.length,2);assert.equal(s.calls.commits,1);
  assert.match(s.calls.writes[1].params[1],/platform\.market\.closed/);
});
test('valid admin reopen keeps audit action',async()=>{
  const s=setup();const r=await s.PUT(req({settings:{...valid.settings,closed:false}}));assert.equal(r.status,200);
  assert.equal(s.calls.writes[1].params[1],'platform.market.opened');
});
test('chunked oversized upload rejected with 413 before any database connection',async()=>{
  const s=setup(),stream=chunked(100000);const r=await s.PUT(stream.request);
  assert.equal(r.status,413);assert.equal(r.body.code,'BODY_TOO_LARGE');assert.equal(s.calls.connection,0);
  assert.ok(stream.sent()<100000,'must stop reading early');
});
test('declared oversize rejected with 413 and no write',async()=>{
  const s=setup(),r=await s.PUT(req(valid,{'content-length':'5000'}));
  assert.equal(r.status,413);assert.equal(s.calls.connection,0);
});
test('invalid content-length rejected with 400 and no write',async()=>{
  const s=setup(),r=await s.PUT(req(valid,{'content-length':'not-a-number'}));
  assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_INPUT');assert.equal(s.calls.connection,0);
});
test('invalid JSON and invalid settings are rejected without writes',async()=>{
  for(const body of ['{bad}',JSON.stringify({settings:{closed:'true',reason:{ar:'a',en:'b',fr:'c'}}})]){
    const s=setup(),r=await s.PUT(req(body));assert.equal(r.status,400);assert.equal(s.calls.connection,0);
  }
});
test('support, anonymous, and cross-origin requests cannot write',async()=>{
  for(const opts of [{role:'support'},{user:null},{originValid:false}]){
    const s=setup(opts),r=await s.PUT(req(valid));assert.ok([401,403].includes(r.status));assert.equal(s.calls.connection,0);
  }
});
test('failed database write rolls back and does not claim success',async()=>{
  const s=setup({failDb:true}),r=await s.PUT(req(valid));assert.equal(r.status,503);
  assert.equal(s.calls.commits,0);assert.equal(s.calls.rollbacks,1);
});
test('Arabic UTF-8 body byte limit is enforced, not character count',async()=>{
  const s=setup();const body=JSON.stringify({settings:{...valid.settings,reason:{...valid.settings.reason,ar:'ع'.repeat(2200)}}});
  assert.ok(body.length<4096);assert.ok(Buffer.byteLength(body)>4096);
  const r=await s.PUT(req(body));assert.equal(r.status,413);assert.equal(s.calls.connection,0);
});
