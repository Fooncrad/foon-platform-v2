import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function compile(path,deps){
 const source=readFileSync(resolve(root,path),'utf8');
 const js=ts.transpileModule(source,{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',js)(name=>{
  if(Object.hasOwn(deps,name))return deps[name];
  return {};
 },mod,mod.exports);
 return mod.exports;
}
const {readLimitedJson}=compile('lib/security/limited-json.ts',{});
class ResourceError extends Error{constructor(code){super(code);this.code=code;}}
class BranchPinError extends Error{constructor(code){super(code);this.code=code;}}
const params={params:Promise.resolve({module:'pos'})};
const tenant='tenant-1',branch='branch-1',user='staff-1';
function setup(options={}){
 const calls={connections:0,created:0,paid:0,commits:0,rollbacks:0,unlocks:0,body:null};
 const conn={
  query:async()=>[[]],
  execute:async(sql,values)=>{
   if(sql.includes('FROM employee_branch_assignments')){
    const assigned=!options.transactionBranchRevoked&&values?.[0]===tenant&&values?.[1]===user&&values?.[2]===branch;
    return [assigned?[{id:1}]:[]];
   }
   return [[]];
  },
  beginTransaction:async()=>{},
  commit:async()=>{calls.commits++;},
  rollback:async()=>{calls.rollbacks++;},
  release:()=>{}
 };
 const db={
  getConnection:async()=>{calls.connections++;return conn;},
  execute:async(sql,values)=>{
   assert.equal(values[0],tenant);
   if(sql.includes('employee_permission_grants'))return [options.grants??[{permission_key:'pos.create',allowed:1,branch_id:branch}]];
   if(sql.includes('employee_branch_assignments'))return [[{branch_id:branch}]];
   throw Error('Unexpected DB query: '+sql);
  }
 };
 const deps={
  'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
  'node:crypto':{randomUUID:()=> '12345678-0000-0000-0000-000000000000'},
  '@/lib/platform/incidents':{normalizeLocale:()=> 'ar',publicError:()=>({error:{message:'Request rejected'}}),logIncident:()=>{}},
  '@/lib/auth/session':{currentUserId:async()=>options.anonymous?null:user,currentSessionId:async()=> 'session-1'},
  '@/lib/auth/authorization':{requireTenantMembership:async(uid,tid,roles,write)=>{
   assert.equal(uid,user);assert.equal(write,true);if(tid!==tenant||options.denied)throw Error('DENIED');
   return {tenantId:tenant,role:options.role??'owner'};
  }},
  '@/lib/restaurant/branch-pin':{BranchPinError,requireAdditionalBranchUnlock:async(tid,bid)=>{
   calls.unlocks++;assert.equal(tid,tenant);if(options.locked)throw new BranchPinError('BRANCH_PIN_REQUIRED');
   if(bid!==null)assert.equal(bid,branch);
  }},
  '@/lib/plans/entitlements':{tenantEntitlement:async()=>({enabled:true})},
  '@/lib/security/origin':{assertSameOrigin:req=>{if(req.headers.get('x-cross-origin'))throw Error('FORBIDDEN');}},
  '@/lib/security/limited-json':{readLimitedJson},
  '@/lib/db/mysql':{database:()=>db},
  '@/scripts/restaurant-resource-schema.mjs':{resourceModules:{},ResourceError},
  '@/lib/restaurant/operations':{
   createOrder:async(_db,tid,uid,body)=>{calls.created++;assert.equal(tid,tenant);assert.equal(uid,user);calls.body=body;return {id:'order-1'};},
   updateOrder:async()=>({id:'order-1'}),
   recordManualPaymentAtCreate:async()=>{calls.paid++;}
  },
  '@/lib/notifications/dispatch':{dispatchNotifications:()=>{}},
  '@/lib/payments/webhook-settlement':{reconcileLateIssuedInvoice:async()=>({status:'not_applicable'})}
 };
 return {post:compile('app/api/restaurant/operations/[module]/route.ts',deps).POST,calls};
}
function request(body,headers={}){
 return new Request('https://example.invalid/api/restaurant/operations/pos',{
  method:'POST',body,duplex:'half',
  headers:{'x-foon-tenant':tenant,'x-foon-branch':branch,...headers}
 });
}
function chunked(body){
 const bytes=new TextEncoder().encode(body);let offset=0;
 const stream=new ReadableStream({pull(controller){
  if(offset>=bytes.length){controller.close();return;}
  const end=Math.min(offset+4096,bytes.length);controller.enqueue(bytes.slice(offset,end));offset=end;
 }});
 return {req:request(stream),get consumed(){return offset;},total:bytes.length};
}
const normal=JSON.stringify({branchId:branch,channel:'pickup',paymentStatus:'pending',items:[{id:'item-1',quantity:1}]});
test('anonymous chunked upload is rejected before body consumption and DB connection',async()=>{
 const h=setup({anonymous:true}),upload=chunked(normal+' '.repeat(3000000));
 const response=await h.post(upload.req,params);
 assert.equal(response.status,401);assert.equal(h.calls.connections,0);assert.equal(h.calls.created,0);
 assert.ok(upload.consumed<upload.total);
});
test('cross-origin chunked upload is rejected before body consumption',async()=>{
 const h=setup(),upload=chunked(normal+' '.repeat(3000000));
 const response=await h.post(new Request(upload.req,{headers:{...Object.fromEntries(upload.req.headers),'x-cross-origin':'1'}}),params);
 assert.equal(response.status,403);assert.equal(h.calls.connections,0);assert.equal(h.calls.created,0);
 assert.ok(upload.consumed<upload.total);
});
test('chunked upload above 1 MiB returns 413 before opening transaction',async()=>{
 const h=setup(),upload=chunked(normal+' '.repeat(1200000));
 const response=await h.post(upload.req,params);
 assert.equal(response.status,413);assert.equal((await response.json()).code,'BODY_TOO_LARGE');
 assert.equal(h.calls.connections,0);assert.equal(h.calls.created,0);assert.ok(upload.consumed<upload.total);
});
test('oversized and malformed declared lengths fail closed',async()=>{
 for(const [length,status] of [['1048577',413],['invalid',400]]){
  const h=setup(),response=await h.post(request(normal,{'content-length':length}),params);
  assert.equal(response.status,status);assert.equal(h.calls.connections,0);
 }
});
test('malformed JSON fails closed before DB connection',async()=>{
 const h=setup(),response=await h.post(request('{invalid'),params);
 assert.equal(response.status,400);assert.equal(h.calls.connections,0);
});
test('valid POS order retains tenant scope and commits',async()=>{
 const h=setup(),response=await h.post(request(normal),params);
 assert.equal(response.status,201);assert.equal(h.calls.created,1);assert.equal(h.calls.commits,1);
 assert.equal(h.calls.body.branchId,branch);
});
test('valid near-limit UTF-8 payload is accepted by bounded parser',async()=>{
 const h=setup(),body=JSON.stringify({...JSON.parse(normal),notes:'م'.repeat(500000)});
 assert.ok(new TextEncoder().encode(body).length<1048576);
 const response=await h.post(request(body),params);
 assert.equal(response.status,201);assert.equal(h.calls.created,1);
});
test('cashier cannot mark POS create paid without explicit pos.edit grant',async()=>{
 const h=setup({role:'cashier'}),body=JSON.stringify({...JSON.parse(normal),paymentStatus:'paid'});
 const response=await h.post(request(body),params);
 assert.equal(response.status,403);assert.equal(h.calls.connections,0);assert.equal(h.calls.created,0);
});
test('cashier with pos.create and pos.edit can create paid order on assigned branch',async()=>{
 const h=setup({role:'cashier',grants:[{permission_key:'pos.create',allowed:1,branch_id:branch},{permission_key:'pos.edit',allowed:1,branch_id:branch}]});
 const response=await h.post(request(JSON.stringify({...JSON.parse(normal),paymentStatus:'paid'})),params);
 assert.equal(response.status,201);assert.equal(h.calls.created,1);assert.equal(h.calls.body.branchId,branch);
});
test('cashier loses access if assigned branch is revoked inside the transaction',async()=>{
 const h=setup({role:'cashier',transactionBranchRevoked:true,grants:[{permission_key:'pos.create',allowed:1,branch_id:branch},{permission_key:'pos.edit',allowed:1,branch_id:branch}]});
 const response=await h.post(request(JSON.stringify({...JSON.parse(normal),paymentStatus:'paid'})),params);
 assert.equal(response.status,403);assert.equal(h.calls.created,0);assert.equal(h.calls.rollbacks,1);
});
test('cashier cannot create an order in a different branch',async()=>{
 const h=setup({role:'cashier'}),body=JSON.stringify({...JSON.parse(normal),branchId:'branch-other'});
 const response=await h.post(request(body),params);
 assert.equal(response.status,403);assert.equal(h.calls.created,0);assert.equal(h.calls.rollbacks,1);
});
test('tenant mismatch and locked branch deny writes',async()=>{
 for(const [opts,headers] of [[{}, {'x-foon-tenant':'tenant-other'}],[{locked:true},{}]]){
  const h=setup(opts),response=await h.post(request(normal,headers),params);
  assert.equal(response.status,403);assert.equal(h.calls.created,0);
 }
});
