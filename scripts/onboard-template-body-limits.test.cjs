const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
function load(file,mocks={}){
 const filename=path.join(__dirname,'..',file),source=fs.readFileSync(filename,'utf8');
 const compiled=ts.transpileModule(source,{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
 assert.equal(compiled.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
 const mod=new Module(filename,module);mod.filename=filename;mod.require=name=>{if(Object.hasOwn(mocks,name))return mocks[name];throw Error('Unexpected mock: '+name)};
 mod._compile(compiled.outputText,filename);return mod.exports;
}
const {readLimitedJson}=load('lib/security/limited-json.ts');
const response=(body,init={})=>Response.json(body,init);
const request=(method,data,headers={})=>new Request('https://foon.test/api',{method,headers:{'x-foon-tenant':'tenant-1',...headers},body:typeof data==='string'?data:JSON.stringify(data)});
const chunked=(method,size)=>new Request('https://foon.test/api',{method,headers:{'x-foon-tenant':'tenant-1'},body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('x'.repeat(size)));c.close()}}),duplex:'half'});
function setup(kind,{user='owner',member=true,locked=false,employee=false,origin=true,active=true}={}){
 const calls=[];let connections=0,commits=0,rollbacks=0;
 const connection={beginTransaction:async()=>{},commit:async()=>{commits++},rollback:async()=>{rollbacks++},release:()=>{},execute:async(sql,args)=>{
  calls.push([sql,args]);if(sql.startsWith('SELECT id FROM users'))return[active?[{id:user}]:[]];return[[]];
 }};
 const mocks={
  'next/server':{NextResponse:{json:response}},
  '@/lib/security/limited-json':{readLimitedJson},
  '@/lib/security/origin':{assertSameOrigin:()=>{if(!origin)throw Error('origin')}},
  '@/lib/auth/session':{currentUserId:async()=>user},
  '@/lib/db/mysql':{database:()=>({execute:async(sql,args)=>{calls.push([sql,args]);return sql.startsWith('SELECT activity_code')?[[{activity_code:'fashion'}]]:[{affectedRows:1}]},getConnection:async()=>{connections++;return connection}})},
  '@/lib/auth/authorization':{requireTenantMembership:async(_user,tenant,roles,write)=>{assert.equal(tenant,'tenant-1');assert.deepEqual(roles,['owner','manager']);assert.equal(write,true);if(!member)throw Error('denied');return{tenantId:tenant}}},
  '@/lib/restaurant/branch-pin':{requireAllAdditionalBranchesUnlocked:async()=>{if(locked)throw Error('locked')}},
  '@/lib/platform/activity-templates':{templatesForActivity:()=>['minimal'],isTemplateForActivity:(_activity,value)=>value==='minimal',defaultTemplateForActivity:()=> 'minimal'},
  '@/lib/auth/account-surface':{employeePersonalAccessDenied:async()=>employee?response({code:'EMPLOYEE_DENIED'},{status:403}):null},
  '@/lib/creator/subscription-commission':{recordCreatorReferral:async()=>{}},
  '@/lib/platform/activity-presets':{isActivityType:v=>v==='fashion',defaultActivityModules:()=>['catalog']},
  '@/lib/tenant/country-catalog':{currencyForCountry:c=>({SA:'SAR',AE:'AED'})[c],countryRegions:{SA:['Riyadh'],AE:['Dubai']}},
  '@/scripts/store-slug.mjs':{validStoreSlug:v=>v==='test-shop'},
  '@/scripts/provision-store.mjs':{provisionStore:async()=>({tenant:{id:'created-tenant'}})},
 };
 const file=kind==='template'?'app/api/restaurant/activity-template/route.ts':'app/api/restaurant/onboard/route.ts';
 return {...load(file,mocks),calls,stats:()=>({connections,commits,rollbacks})};
}
const valid={name:'متجر الاختبار',slug:'test-shop',activity:'fashion',countryCode:'SA',currency:'SAR',region:'Riyadh',legalAccepted:true};
test('template: valid update writes only to authorized tenant',async()=>{const h=setup('template'),r=await h.PUT(request('PUT',{template:'minimal'}));assert.equal(r.status,200);assert.deepEqual(h.calls.at(-1)[1],['tenant-1','minimal'])});
test('template: declared oversize rejects with 413 and no write',async()=>{const h=setup('template'),r=await h.PUT(request('PUT','{}',{'content-length':'1025'}));assert.equal(r.status,413);assert.equal((await r.json()).code,'BODY_TOO_LARGE');assert.equal(h.calls.length,1)});
test('template: chunked oversize rejects with 413',async()=>{const h=setup('template'),r=await h.PUT(chunked('PUT',1100));assert.equal(r.status,413);assert.equal(h.calls.length,1)});
test('template: malformed length, JSON and invalid template reject',async()=>{const h=setup('template');for(const r of [request('PUT','{}',{'content-length':'bad'}),request('PUT','{'),request('PUT',{template:'unknown'})])assert.equal((await h.PUT(r)).status,400);assert.equal(h.calls.length,3)});
test('template: anonymous, non-member, locked branch and wrong origin reject',async()=>{for(const [opts,status] of [[{user:null},401],[{member:false},403],[{locked:true},403],[{origin:false},403]]){const h=setup('template',opts);assert.equal((await h.PUT(request('PUT',{template:'minimal'}))).status,status);assert.equal(h.calls.some(([sql])=>sql.startsWith('INSERT')),false)}});
test('onboard: valid store preserves country, currency, activity and owner',async()=>{const h=setup('onboard'),r=await h.POST(request('POST',valid));assert.equal(r.status,201);assert.deepEqual(h.stats(),{connections:1,commits:1,rollbacks:0});assert.deepEqual(h.calls.find(([sql])=>sql.startsWith('INSERT INTO tenant_business_profiles'))[1],['created-tenant','fashion','SA','SAR','Riyadh',null])});
test('onboard: declared oversize rejects before DB transaction',async()=>{const h=setup('onboard'),r=await h.POST(request('POST','{}',{'content-length':'8193'}));assert.equal(r.status,413);assert.equal((await r.json()).code,'BODY_TOO_LARGE');assert.equal(h.stats().connections,0)});
test('onboard: chunked oversize rejects before DB transaction',async()=>{const h=setup('onboard'),r=await h.POST(chunked('POST',9000));assert.equal(r.status,413);assert.equal(h.stats().connections,0)});
test('onboard: malformed length/JSON, invalid currency and consent reject',async()=>{const h=setup('onboard');for(const r of [request('POST','{}',{'content-length':'bad'}),request('POST','{'),request('POST',{...valid,currency:'AED'}),request('POST',{...valid,legalAccepted:false})])assert.equal((await h.POST(r)).status,400);assert.equal(h.stats().connections,0)});
test('onboard: employee, anonymous and wrong origin cannot create store',async()=>{for(const [opts,status] of [[{employee:true},403],[{user:null},401],[{origin:false},403]]){const h=setup('onboard',opts);assert.equal((await h.POST(request('POST',valid))).status,status);assert.equal(h.stats().connections,0)}});
test('onboard: inactive owner rolls back and never commits',async()=>{const h=setup('onboard',{active:false}),r=await h.POST(request('POST',valid));assert.equal(r.status,403);assert.deepEqual(h.stats(),{connections:1,commits:0,rollbacks:1})});
