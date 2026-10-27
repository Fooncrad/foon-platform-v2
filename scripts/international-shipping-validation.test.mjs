import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {readLimitedJson} from '../lib/security/limited-json.ts';
import {normalizeForeignCountries,parseRequestedForeignCountries} from '../lib/tenant/international-shipping-validation.mjs';
const supported=new Set(['SA','AE','KW','EG','US']);
const normalize=(countries,merchant='SA')=>normalizeForeignCountries(countries,merchant,supported);
const stored=(countries,merchant='SA')=>parseRequestedForeignCountries(countries,merchant,supported);

test('accepts explicitly supported foreign countries and removes home country and duplicates',()=>{
 assert.deepEqual(normalize(['SA','AE','KW','AE']),['AE','KW']);
 assert.deepEqual(normalize(['AE'],'sa'),['AE']);
});
test('rejects unsupported but syntactically valid country codes',()=>{
 for(const value of [['ZZ'],['AE','ZZ'],['XX'],['UK']])assert.equal(normalize(value),null);
});
test('rejects malformed, lowercase, and non-string destinations',()=>{
 for(const value of [['ae'],['AE',12],['A'],['SA '],['A1'],['']])assert.equal(normalize(value),null);
});
test('rejects invalid home country, missing countries, and more than 80 inputs',()=>{
 assert.equal(normalize(['AE'],'ZZ'),null);
 for(const value of [null,{},[],['AE',...Array(80).fill('KW')]])assert.equal(normalize(value),null);
});
test('a request containing only home country produces no foreign destinations',()=>{
 assert.deepEqual(normalize(['SA','SA']),[]);
});
test('stored JSON is revalidated, not trusted as approved destination list',()=>{
 assert.deepEqual(stored('["AE","KW"]'),['AE','KW']);
 assert.equal(stored('["AE","ZZ"]'),null);
 assert.equal(stored('{broken'),null);
 assert.equal(stored('{}'),null);
});
test('merchant, admin and delivery policy all invoke catalogue validation',()=>{
 const root=new URL('../',import.meta.url);
 const merchant=readFileSync(new URL('app/api/restaurant/international-shipping/route.ts',root),'utf8');
 const admin=readFileSync(new URL('app/api/admin/international-shipping/route.ts',root),'utf8');
 const policy=readFileSync(new URL('lib/tenant/international-shipping.ts',root),'utf8');
 assert.match(merchant,/normalizeForeignCountries\(countries,merchantCountry,supportedCountryCodes\)/);
 assert.match(admin,/parseRequestedForeignCountries\(rows\[0\]\.requested_countries,String\(rows\[0\]\.country_code\),supportedCountryCodes\)/);
 assert.match(policy,/supportedCountryCodes\.has\(x\)/);
});
test('both mutation endpoints enforce byte-bounded JSON before database writes',()=>{
 const root=new URL('../',import.meta.url);
 for(const path of ['app/api/restaurant/international-shipping/route.ts','app/api/admin/international-shipping/route.ts']){
  const source=readFileSync(new URL(path,root),'utf8');
  assert.match(source,/readLimitedJson\(request,2048\)/);
  assert.match(source,/BODY_TOO_LARGE/);
  assert.doesNotMatch(source,/request\.json\(/);
 }
});

test('bounded JSON reader rejects a declared oversized request before parsing',async()=>{
 const req=new Request('https://example.test/',{method:'POST',body:'{}',headers:{'content-length':'2049'}});
 await assert.rejects(readLimitedJson(req,2048),/BATCH_TOO_LARGE/);
});
test('bounded JSON reader rejects chunked uploads without Content-Length',async()=>{
 let pulled=0;
 const stream=new ReadableStream({pull(c){pulled++;c.enqueue(new Uint8Array(1024));if(pulled===10)c.close();}});
 const req=new Request('https://example.test/',{method:'POST',body:stream,duplex:'half'});
 await assert.rejects(readLimitedJson(req,2048),/BATCH_TOO_LARGE/);
 assert.ok(pulled<10);
});
