import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const payment = 'app/api/customer/payments/route.ts';
const geocode = 'app/api/customer/reverse-geocode/route.ts';
const orderId = '12345678-1234-1234-1234-123456789abc';
const geoBody = JSON.stringify({latitude:24.7,longitude:46.6,storeSlug:'demo-store'});
const payBody = JSON.stringify({orderId});

function compile(path, deps={}, fakeFetch=()=>{throw Error('unexpected fetch');}) {
  const source=readFileSync(resolve(root,path),'utf8');
  const output=ts.transpileModule(source,{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const cjsModule={exports:{}};
  new Function('require','module','exports','process','fetch',output)(
    name=>{if(Object.hasOwn(deps,name))return deps[name];throw Error('Unexpected import: '+name);},
    cjsModule,cjsModule.exports,{env:{GOOGLE_MAPS_GEOCODING_API_KEY:'synthetic',APP_URL:'https://example.invalid'}},fakeFetch);
  return cjsModule.exports;
}
const {readLimitedJson}=compile('lib/security/limited-json.ts');
function handler(path,opts={}) {
  const calls={payment:0,geocode:0};
  class CheckoutError extends Error {}
  const deps={
    'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
    '@/lib/auth/account-surface':{employeePersonalAccessDenied:async()=>opts.employee?Response.json({}, {status:403}):null},
    '@/lib/auth/session':{currentUserId:async()=>opts.anonymous?null:'customer-1'},
    '@/lib/security/origin':{assertSameOrigin:req=>{if(req.headers.get('x-cross-origin'))throw Error('FORBIDDEN');}},
    '@/lib/security/limited-json':{readLimitedJson},
    '@/lib/db/mysql':{database:()=>({execute:async()=>[[{id:'store-1',country_code:'SA',activity_code:'restaurant'}]]})},
    '@/lib/tenant/international-shipping':{allowedDeliveryCountries:async()=>opts.countries??['SA']},
    '@/lib/tenant/reverse-geocode':{normalizedReverseGeocode:()=>({countryCode:'SA'})},
    '@/lib/payments/customer-checkout':{CheckoutError,startCustomerPayment:async()=>{calls.payment++;return {redirectUrl:'https://example.invalid/pay'};}},
  };
  const routeModule=compile(path,deps,async()=>{calls.geocode++;return Response.json({results:[]});});
  return {POST:routeModule.POST,calls};
}
function req(path,body,headers={}) {
  return new Request('https://example.invalid/'+path,{method:'POST',body,headers});
}
function chunked(path,body) {
  const bytes=new TextEncoder().encode(body);let offset=0;
  const stream=new ReadableStream({pull(controller){
    if(offset>=bytes.length){controller.close();return;}
    const end=Math.min(offset+4096,bytes.length);
    controller.enqueue(bytes.slice(offset,end));offset=end;
  }});
  return {request:new Request('https://example.invalid/'+path,{method:'POST',body:stream,duplex:'half'}),get consumed(){return offset;},total:bytes.length};
}

test('valid customer payment starts checkout',async()=>{
  const {POST,calls}=handler(payment);const response=await POST(req('api/customer/payments',payBody));
  assert.equal(response.status,200);assert.equal(calls.payment,1);
});
test('chunked payment overflow returns 413 without full buffering or checkout',async()=>{
  const {POST,calls}=handler(payment),upload=chunked('api/customer/payments',payBody+' '.repeat(80000));
  const response=await POST(upload.request);
  assert.equal(response.status,413);assert.equal((await response.json()).code,'BODY_TOO_LARGE');
  assert.ok(upload.consumed<upload.total);assert.equal(calls.payment,0);
});
test('payment rejects malformed input, extra fields and cross-origin requests',async()=>{
  const {POST,calls}=handler(payment);
  assert.equal((await POST(req('api/customer/payments','{bad'))).status,400);
  assert.equal((await POST(req('api/customer/payments',JSON.stringify({orderId,extra:true})))).status,400);
  assert.equal((await POST(req('api/customer/payments',payBody,{'x-cross-origin':'1'}))).status,403);
  assert.equal(calls.payment,0);
});
test('valid customer reverse geocode remains country-scoped',async()=>{
  const {POST,calls}=handler(geocode);assert.equal((await POST(req('api/customer/reverse-geocode',geoBody))).status,200);
  assert.equal(calls.geocode,1);
  assert.equal((await handler(geocode,{countries:['KW']}).POST(req('api/customer/reverse-geocode',geoBody))).status,400);
});
test('chunked reverse geocode overflow returns 413 without provider calls',async()=>{
  const {POST,calls}=handler(geocode),upload=chunked('api/customer/reverse-geocode',JSON.stringify({...JSON.parse(geoBody),padding:'x'.repeat(80000)}));
  const response=await POST(upload.request);
  assert.equal(response.status,413);assert.equal((await response.json()).code,'BODY_TOO_LARGE');
  assert.ok(upload.consumed<upload.total);assert.equal(calls.geocode,0);
});
test('reverse geocode rejects malformed input and employee or anonymous access',async()=>{
  assert.equal((await handler(geocode).POST(req('api/customer/reverse-geocode','{bad'))).status,400);
  assert.equal((await handler(geocode,{employee:true}).POST(req('api/customer/reverse-geocode',geoBody))).status,403);
  assert.equal((await handler(geocode,{anonymous:true}).POST(req('api/customer/reverse-geocode',geoBody))).status,401);
});
test('declared oversized bodies are rejected before provider or payment',async()=>{
  assert.equal((await handler(payment).POST(req('api/customer/payments',payBody,{'content-length':'1025'}))).status,413);
  assert.equal((await handler(geocode).POST(req('api/customer/reverse-geocode',geoBody,{'content-length':'1025'}))).status,413);
});
