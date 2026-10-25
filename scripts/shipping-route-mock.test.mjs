import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {readLimitedJson} from '../lib/security/limited-json.ts';
import {normalizeForeignCountries,parseRequestedForeignCountries} from '../lib/tenant/international-shipping-validation.mjs';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const root=new URL('../',import.meta.url);
const uuid='11111111-1111-1111-1111-111111111111';
const supportedCountries=[{code:'SA'},{code:'AE'},{code:'KW'}];
const reply={json:(body,{status=200}={})=>({status,body})};
const request=(body)=>new Request('https://example.test/api/international-shipping',{method:'POST',body:JSON.stringify(body),headers:{'x-foon-tenant':uuid}});
const largeRequest=()=>new Request('https://example.test/api/international-shipping',{method:'POST',body:JSON.stringify({countries:['AE'],padding:'x'.repeat(3000)}),headers:{'x-foon-tenant':uuid}});
function load(path,modules){
 const src=readFileSync(new URL(path,root),'utf8');
 const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};
 new Function('require','module','exports',code)(name=>{
  if(name in modules)return modules[name];
  throw new Error('Unmocked dependency '+name);
 },m,m.exports);
 return m.exports;
}
function merchant(){
 const writes=[];
 const db={execute:async(sql,args)=>{
  if(sql.includes('SELECT activity_code,country_code'))return [[{activity_code:'clothing',country_code:'SA'}]];
  writes.push({sql,args});return [{affectedRows:1}];
 }};
 const mod=load('app/api/restaurant/international-shipping/route.ts',{
  'next/server':{NextResponse:reply},'@/lib/db/mysql':{database:()=>db},
  '@/lib/auth/session':{currentUserId:async()=>uuid},
  '@/lib/auth/authorization':{requireTenantMembership:async()=>({tenantId:uuid})},
  '@/lib/security/origin':{assertSameOrigin:()=>{}},
  '@/lib/security/limited-json':{readLimitedJson},
  '@/lib/restaurant/branch-pin':{requireAllAdditionalBranchesUnlocked:async()=>{}},
  '@/lib/tenant/country-catalog':{supportedCountries},
  '@/lib/tenant/international-shipping-validation.mjs':{normalizeForeignCountries},
  '@/lib/tenant/international-shipping':{internationalEligible:()=>true,internationalShipping:async()=>({status:'none'})}
 });
 return {mod,writes};
}
function admin(requested='["AE"]',status='pending'){
 const writes=[];
 const db={execute:async(sql,args)=>{
  if(sql.includes('SELECT s.status'))return [[{status,requested_countries:requested,country_code:'SA',activity_code:'clothing'}]];
  writes.push({sql,args});return [{affectedRows:1}];
 }};
 const mod=load('app/api/admin/international-shipping/route.ts',{
  'next/server':{NextResponse:reply},'@/lib/db/mysql':{database:()=>db},
  '@/lib/auth/session':{currentActiveAdminUserId:async()=>uuid},
  '@/lib/auth/authorization':{requirePlatformRole:async()=>{}},
  '@/lib/security/origin':{assertSameOrigin:()=>{}},
  '@/lib/security/limited-json':{readLimitedJson},
  '@/lib/tenant/country-catalog':{supportedCountries},
  '@/lib/tenant/international-shipping-validation.mjs':{parseRequestedForeignCountries}
 });
 return {mod,writes};
}
test('merchant request rejects ZZ without inserting pending destinations',async()=>{
 const {mod,writes}=merchant();const result=await mod.POST(request({countries:['ZZ']}));
 assert.equal(result.status,400);assert.equal(result.body.code,'INVALID_INPUT');assert.equal(writes.length,0);
});
test('merchant request accepts valid AE and persists only foreign countries',async()=>{
 const {mod,writes}=merchant();const result=await mod.POST(request({countries:['SA','AE','AE']}));
 assert.equal(result.status,200);assert.equal(writes.length,1);assert.equal(writes[0].args[1],'["AE"]');
});
test('admin rejects unsupported stored destinations without approving',async()=>{
 const {mod,writes}=admin('["ZZ"]');const result=await mod.POST(request({tenantId:uuid,status:'approved'}));
 assert.equal(result.status,400);assert.equal(result.body.code,'INVALID_DESTINATIONS');assert.equal(writes.length,0);
});
test('admin rejects corrupt stored JSON without approving',async()=>{
 const {mod,writes}=admin('{broken');const result=await mod.POST(request({tenantId:uuid,status:'approved'}));
 assert.equal(result.status,400);assert.equal(result.body.code,'INVALID_DESTINATIONS');assert.equal(writes.length,0);
});
test('admin approves supported AE and records exactly approved destinations',async()=>{
 const {mod,writes}=admin('["AE"]');const result=await mod.POST(request({tenantId:uuid,status:'approved'}));
 assert.equal(result.status,200);assert.deepEqual(result.body.approvedCountries,['AE']);assert.equal(writes.length,1);assert.equal(writes[0].args[1],'["AE"]');
});
test('admin can disable a corrupt legacy request without JSON parsing',async()=>{
 const {mod,writes}=admin('{broken','approved');const result=await mod.POST(request({tenantId:uuid,status:'disabled'}));
 assert.equal(result.status,200);assert.equal(writes.length,1);assert.equal(writes[0].args[1],null);
});
test('merchant and admin reject oversized request bodies before DB writes',async()=>{
 for(const factory of [merchant,admin]){
  const {mod,writes}=factory();const result=await mod.POST(largeRequest());
  assert.equal(result.status,413);assert.equal(result.body.code,'BODY_TOO_LARGE');assert.equal(writes.length,0);
 }
});
