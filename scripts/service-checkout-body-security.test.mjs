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
 new Function('require','module','exports',js)(name=>{if(Object.hasOwn(deps,name))return deps[name];throw Error('Unexpected dependency: '+name);},mod,mod.exports);
 return mod.exports;
}
const {readLimitedJson}=compile('lib/security/limited-json.ts');
const invoiceId='12345678-1234-1234-1234-123456789abc';
const body=JSON.stringify({invoiceId,customerEmail:'customer@example.test',consentConfirmed:true});
const path='app/api/restaurant/payments/service-checkout/route.ts';
class BranchPinError extends Error{constructor(code){super(code);this.code=code;}}
class CheckoutError extends Error{constructor(code,status){super(code);this.status=status;}}
function handler(options={}){
 const calls={membership:0,invoice:0,checkout:0,unlock:0};
 const db={execute:async(sql,params)=>{calls.invoice++;assert.equal(params[0],'tenant-1');assert.equal(params[1],invoiceId);return [[{branch_id:'branch-1'}]];}};
 const deps={
  'next/server':{NextResponse:{json:(data,init)=>Response.json(data,init)}},
  '@/lib/auth/session':{currentUserId:async()=>options.anonymous?null:'owner-1'},
  '@/lib/auth/authorization':{requireTenantMembership:async(user,tenant,roles,write)=>{calls.membership++;assert.equal(tenant,'tenant-1');assert.deepEqual(roles,['owner','manager']);assert.equal(write,true);if(options.denied)throw Error('FORBIDDEN');}},
  '@/lib/security/origin':{assertSameOrigin:req=>{if(req.headers.get('x-cross-origin'))throw Error('FORBIDDEN');}},
  '@/lib/security/limited-json':{readLimitedJson},
  '@/lib/plans/entitlements':{tenantEntitlement:async()=>({enabled:!options.planDenied})},
  '@/lib/db/mysql':{database:()=>db},
  '@/lib/payments/customer-checkout':{CheckoutError},
  '@/lib/payments/service-invoice-checkout':{startServiceInvoiceSandboxCheckout:async(_,args)=>{calls.checkout++;assert.equal(args.tenantId,'tenant-1');assert.equal(args.invoiceId,invoiceId);return {checkoutUrl:'https://sandbox.invalid/pay'};}},
  '@/lib/restaurant/branch-pin':{BranchPinError,requireAdditionalBranchUnlock:async(tenant,branch,user)=>{calls.unlock++;assert.equal(tenant,'tenant-1');assert.equal(branch,'branch-1');assert.equal(user,'owner-1');if(options.locked)throw new BranchPinError('BRANCH_PIN_REQUIRED');}},
 };
 return {post:compile(path,deps).POST,calls};
}
function request(data,headers={}){return new Request('https://example.invalid/'+path,{method:'POST',body:data,duplex:'half',headers:{'x-foon-tenant':'tenant-1',...headers}});}
function chunked(data){const bytes=new TextEncoder().encode(data);let offset=0;const stream=new ReadableStream({pull(controller){if(offset>=bytes.length){controller.close();return;}const end=Math.min(offset+512,bytes.length);controller.enqueue(bytes.slice(offset,end));offset=end;}});return {req:request(stream),get consumed(){return offset;},total:bytes.length};}
test('service invoice: valid scoped checkout still works',async()=>{const h=handler(),r=await h.post(request(body));assert.equal(r.status,200);assert.equal(h.calls.invoice,1);assert.equal(h.calls.checkout,1);assert.equal(h.calls.unlock,1);});
test('service invoice: streamed oversized body rejected before database access',async()=>{const h=handler(),upload=chunked(body+' '.repeat(50000));const r=await h.post(upload.req);assert.equal(r.status,413);assert.equal((await r.json()).code,'BODY_TOO_LARGE');assert.equal(h.calls.invoice,0);assert.ok(upload.consumed<upload.total);});
test('service invoice: invalid and oversized Content-Length fail closed',async()=>{for(const [length,status] of [['1025',413],['invalid',400]]){const h=handler(),r=await h.post(request(body,{'content-length':length}));assert.equal(r.status,status);assert.equal(h.calls.invoice,0);}});
test('service invoice: malformed JSON, cross-origin, denied owner and plan denial cannot checkout',async()=>{for(const [data,headers,opts,status] of [['{broken',{}, {},400],[body,{'x-cross-origin':'1'},{},403],[body,{}, {denied:true},403],[body,{}, {planDenied:true},403]]){const h=handler(opts),r=await h.post(request(data,headers));assert.equal(r.status,status);assert.equal(h.calls.checkout,0);}});
test('service invoice: branch PIN still blocks payment checkout',async()=>{const h=handler({locked:true}),r=await h.post(request(body));assert.equal(r.status,403);assert.equal((await r.json()).code,'BRANCH_PIN_REQUIRED');assert.equal(h.calls.checkout,0);});
