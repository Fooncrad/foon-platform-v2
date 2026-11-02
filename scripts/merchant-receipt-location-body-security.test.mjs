import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as crypto from 'node:crypto';
import ts from 'typescript';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const receiptPath='app/api/restaurant/receipts/route.ts';
const locationPath='app/api/restaurant/location-settings/route.ts';
const orderId='12345678-1234-1234-1234-123456789abc';

function compile(path,deps={}){
 const source=readFileSync(resolve(root,path),'utf8');
 const js=ts.transpileModule(source,{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',js)(name=>{
  if(Object.hasOwn(deps,name))return deps[name];
  if(name==='node:crypto')return crypto;
  throw Error('Unexpected dependency: '+name);
 },mod,mod.exports);
 return mod.exports;
}
const {readLimitedJson}=compile('lib/security/limited-json.ts');
const next={NextResponse:{json:(body,init)=>Response.json(body,init)}};
class BranchPinError extends Error {constructor(code){super(code);this.code=code;}}
function handlers(opts={}){
 const calls={getConnection:0,begin:0,commit:0,rollback:0,release:0,execute:0,unlock:0,membership:0,staffReceipt:0};
 const conn={
  beginTransaction:async()=>{calls.begin++;},commit:async()=>{calls.commit++;},rollback:async()=>{calls.rollback++;},release:()=>{calls.release++;},
  execute:async(sql)=>{calls.execute++;
   if(sql.includes('FROM restaurant_orders'))return [[{id:orderId,branch_id:'branch-1',customer_user_id:'customer-1',status:'completed',payment_status:'paid',checkout_snapshot:null}]];
   if(sql.includes('FROM tenants'))return [[{slug:'store-1',data:{receiptQrDestination:'receipt'}}]];
   return [[]];
  }
 };
 const db={getConnection:async()=>{calls.getConnection++;return conn;},execute:async()=>{calls.execute++;return [[]];}};
 const common={
  'next/server':next,
  '@/lib/auth/session':{currentUserId:async()=>opts.anonymous?null:'merchant-1'},
  '@/lib/db/mysql':{database:()=>db},
  '@/lib/security/origin':{assertSameOrigin:request=>{if(request.headers.get('x-cross-origin'))throw Error('FORBIDDEN');}},
  '@/lib/security/limited-json':{readLimitedJson},
  '@/lib/restaurant/branch-pin':{BranchPinError,requireAdditionalBranchUnlock:async()=>{calls.unlock++;},requireAllAdditionalBranchesUnlocked:async()=>{calls.unlock++;if(opts.locked)throw new BranchPinError('BRANCH_PIN_REQUIRED');}},
  '@/lib/auth/authorization':{requireTenantMembership:async(user,tenant,roles,write)=>{calls.membership++;if(opts.denied||tenant!=='tenant-1')throw Error('FORBIDDEN');assert.deepEqual(roles,['owner','manager']);assert.equal(write,true);return {tenantId:'tenant-1'};}},
  '@/lib/restaurant/receipt-authorization':{canReadStaffReceipt:async()=>{calls.staffReceipt++;return !opts.denied;}},
  '@/lib/restaurant/final-receipt-policy':{finalReceiptEligible:(status,payment)=>status==='completed'&&payment==='paid'},
  '@/lib/tenant/free-location':{defaultLocationSettings:{},parseLocationSettings:input=>input&&input.deliveryMode==='manual'&&typeof input.outsideMessage==='string'&&typeof input.googleAnalyticsId==='string'&&typeof input.facebookPixelId==='string'&&typeof input.aiAssistantRequested==='boolean'?input:null},
 };
 return {receipt:compile(receiptPath,common).POST,location:compile(locationPath,common).PUT,calls};
}
function request(path,body,headers={}){return new Request('https://example.invalid/'+path,{method:'POST',body,headers:{'x-foon-tenant':'tenant-1',...headers}});}
function chunked(path,body){
 const bytes=new TextEncoder().encode(body);let offset=0;
 const stream=new ReadableStream({pull(controller){if(offset>=bytes.length){controller.close();return;}const end=Math.min(offset+1024,bytes.length);controller.enqueue(bytes.slice(offset,end));offset=end;}});
 const req=new Request('https://example.invalid/'+path,{method:'POST',body:stream,duplex:'half',headers:{'x-foon-tenant':'tenant-1'}});
 return {req,get consumed(){return offset;},total:bytes.length};
}
const locationBody=JSON.stringify({deliveryMode:'manual',latitude:null,longitude:null,radiusKm:null,outsideMessage:'',googleAnalyticsId:'',facebookPixelId:'',aiAssistantRequested:false});

test('receipt: a valid paid, completed order still returns a scoped receipt link',async()=>{
 const h=handlers(),r=await h.receipt(request(receiptPath,JSON.stringify({id:orderId})));
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,path:'/receipts/'+orderId,destination:'receipt'});
 assert.equal(h.calls.staffReceipt,1);assert.equal(h.calls.commit,1);assert.equal(h.calls.release,1);
});
test('receipt: streamed oversized JSON is rejected before opening a transaction',async()=>{
 const h=handlers(),upload=chunked(receiptPath,JSON.stringify({id:orderId,pad:'x'.repeat(60000)}));
 const r=await h.receipt(upload.req);assert.equal(r.status,413);assert.equal((await r.json()).code,'BODY_TOO_LARGE');
 assert.equal(h.calls.getConnection,0);assert.ok(upload.consumed<upload.total);
});
test('receipt: declared oversized body and invalid length fail before DB',async()=>{
 for(const [value,status] of [['1025',413],['invalid',400]]){
  const h=handlers(),r=await h.receipt(request(receiptPath,'{}',{'content-length':value}));
  assert.equal(r.status,status);assert.equal(h.calls.getConnection,0);
 }
});
test('receipt: invalid ID, malformed JSON and cross-origin never reach DB',async()=>{
 for(const [body,headers,status] of [['{broken',{},400],[JSON.stringify({id:'wrong'}),{},400],[JSON.stringify({id:orderId}),{'x-cross-origin':'1'},403]]){
  const h=handlers(),r=await h.receipt(request(receiptPath,body,headers));
  assert.equal(r.status,status);assert.equal(h.calls.getConnection,0);
 }
});
test('receipt: denied staff is not given receipt link',async()=>{
 const h=handlers({denied:true}),r=await h.receipt(request(receiptPath,JSON.stringify({id:orderId})));
 assert.equal(r.status,404);assert.equal(h.calls.commit,0);assert.equal(h.calls.rollback,1);
});
test('location: valid merchant settings still persist with tenant scope and PIN unlock',async()=>{
 const h=handlers(),r=await h.location(request(locationPath,locationBody));
 assert.equal(r.status,200);assert.equal(h.calls.membership,1);assert.equal(h.calls.unlock,1);assert.equal(h.calls.execute,1);
});
test('location: streamed oversized JSON is rejected before PIN unlock or DB write',async()=>{
 const h=handlers(),upload=chunked(locationPath,locationBody+' '.repeat(60000));
 const r=await h.location(upload.req);assert.equal(r.status,413);assert.equal((await r.json()).code,'BODY_TOO_LARGE');
 assert.equal(h.calls.unlock,0);assert.equal(h.calls.execute,0);assert.ok(upload.consumed<upload.total);
});
test('location: declared oversized and malformed Content-Length are rejected',async()=>{
 for(const [value,status] of [['4097',413],['not-a-number',400]]){
  const h=handlers(),r=await h.location(request(locationPath,locationBody,{'content-length':value}));
  assert.equal(r.status,status);assert.equal(h.calls.unlock,0);assert.equal(h.calls.execute,0);
 }
});
test('location: invalid JSON and cross-origin writes cannot change settings',async()=>{
 for(const [body,headers,status] of [['{broken',{},400],[locationBody,{'x-cross-origin':'1'},403]]){
  const h=handlers(),r=await h.location(request(locationPath,body,headers));
  assert.equal(r.status,status);assert.equal(h.calls.unlock,0);assert.equal(h.calls.execute,0);
 }
});
test('location: branch PIN and tenant membership continue to deny unauthorized writes',async()=>{
 const locked=handlers({locked:true});assert.equal((await locked.location(request(locationPath,locationBody))).status,403);assert.equal(locked.calls.execute,0);
 const denied=handlers({denied:true});assert.equal((await denied.location(request(locationPath,locationBody))).status,403);assert.equal(denied.calls.execute,0);
});
