const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'app/api/restaurant/staff-help/route.ts'),'utf8');
const readerSource=fs.readFileSync(path.join(root,'lib/security/limited-json.ts'),'utf8');
function load(text,resolve){const mod={exports:{}};const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',js)(resolve,mod,mod.exports);return mod.exports;}
const {readLimitedJson}=load(readerSource,require);
const tenant='11111111-1111-4111-8111-111111111111';
const branch='22222222-2222-4222-8222-222222222222';
const otherBranch='33333333-3333-4333-8333-333333333333';
const user='44444444-4444-4444-8444-444444444444';
const call='55555555-5555-4555-8555-555555555555';
class BranchPinError extends Error{constructor(){super('PIN');this.code='BRANCH_PIN_REQUIRED';}}
function harness({role='waiter',assigned=[branch],session=user,origin=true,pin=true,existingBranch=branch,affectedRows=1}={}){
 const queries=[],unlocks=[];
 const db={async execute(sql,params){queries.push({sql,params});
   if(sql.includes('employee_branch_assignments')){assert.deepEqual(params,[tenant,user]);return [assigned.map(branch_id=>({branch_id}))];}
   if(sql.startsWith('SELECT id FROM branches')){assert.deepEqual(params,[branch,tenant]);return [[{id:branch}]];}
   if(sql.startsWith('SELECT branch_id FROM restaurant_resources')){assert.deepEqual(params,[call,tenant]);return [[{branch_id:existingBranch}]];}
   if(sql.startsWith('UPDATE restaurant_resources')){assert.deepEqual(params,[call,tenant]);return [{affectedRows}];}
   if(sql.startsWith('INSERT INTO restaurant_resources')){assert.equal(params[1],tenant);assert.equal(params[2],branch);return [{affectedRows:1}];}
   if(sql.startsWith('INSERT INTO restaurant_audit_events')){assert.equal(params[0],tenant);assert.equal(params[1],user);return [{affectedRows:1}];}
   throw Error('unexpected SQL: '+sql);
 }};
 const req=(name)=>{
   if(name==='node:crypto')return require(name);
   if(name==='next/server')return {NextResponse:{json:(body,opts={})=>({status:opts.status??200,body})}};
   if(name==='@/lib/auth/session')return {currentUserId:async()=>session};
   if(name==='@/lib/auth/authorization')return {requireTenantMembership:async(u,t)=>{assert.equal(u,user);assert.equal(t,tenant);return {role};}};
   if(name==='@/lib/db/mysql')return {database:()=>db};
   if(name==='@/lib/security/origin')return {assertSameOrigin:()=>{if(!origin)throw Error('bad origin');}};
   if(name==='@/lib/security/limited-json')return {readLimitedJson};
   if(name==='@/lib/restaurant/branch-pin')return {BranchPinError,requireAdditionalBranchUnlock:async(t,b,u)=>{unlocks.push([t,b,u]);if(!pin)throw new BranchPinError();},onlyUnlockedBranchRows:async(_t,_u,rows)=>rows};
   throw Error('unmocked '+name);
 };
 return {...load(source,req),queries,unlocks};
}
function request(body,headers={}){return new Request('https://nfoodz.com/api/restaurant/staff-help',{method:'POST',body,headers,duplex:'half'});}
function chunked(text){const bytes=new TextEncoder().encode(text);return new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=128)c.enqueue(bytes.slice(i,i+128));c.close();}});}
const valid={tenantId:tenant,branchId:branch,description:'Need urgent kitchen support'};
test('accepts staff help request on explicitly assigned branch and audits tenant',async()=>{
 const h=harness();const result=await h.POST(request(JSON.stringify(valid)));
 assert.equal(result.status,201);assert.equal(result.body.ok,true);
 assert.equal(h.unlocks.length,1);assert.deepEqual(h.unlocks[0],[tenant,branch,user]);
 assert.equal(h.queries.filter(q=>q.sql.startsWith('INSERT')).length,2);
});
test('rejects staff help for an unassigned branch',async()=>{
 const h=harness();const result=await h.POST(request(JSON.stringify({...valid,branchId:otherBranch})));
 assert.equal(result.status,400);assert.equal(h.unlocks.length,0);
});
test('manager can resolve pending request in assigned branch with PIN and audit',async()=>{
 const h=harness({role:'manager'});const result=await h.POST(request(JSON.stringify({tenantId:tenant,action:'resolve',id:call})));
 assert.equal(result.status,200);assert.equal(h.unlocks.length,1);
 assert.equal(h.queries.filter(q=>q.sql.startsWith('UPDATE restaurant_resources')).length,1);
});
test('waiter cannot resolve staff help',async()=>{
 const h=harness();const result=await h.POST(request(JSON.stringify({tenantId:tenant,action:'resolve',id:call})));
 assert.equal(result.status,403);assert.equal(h.unlocks.length,0);
});
test('manager cannot resolve request in another branch',async()=>{
 const h=harness({role:'manager',existingBranch:otherBranch});const result=await h.POST(request(JSON.stringify({tenantId:tenant,action:'resolve',id:call})));
 assert.equal(result.status,403);assert.equal(h.unlocks.length,0);
});
test('PIN lock fails closed on staff help creation',async()=>{
 const h=harness({pin:false});const result=await h.POST(request(JSON.stringify(valid)));
 assert.equal(result.status,403);assert.equal(result.body.code,'BRANCH_PIN_REQUIRED');
 assert.equal(h.queries.filter(q=>q.sql.startsWith('INSERT')).length,0);
});
test('rejects chunked JSON over 2048 bytes before membership and DB reads',async()=>{
 const h=harness();const result=await h.POST(request(chunked(JSON.stringify({...valid,description:'x'.repeat(5000)}))));
 assert.equal(result.status,413);assert.equal(result.body.code,'BODY_TOO_LARGE');assert.equal(h.queries.length,0);
});
test('rejects oversized Content-Length before DB reads',async()=>{
 const h=harness();const result=await h.POST(request('{}',{'content-length':'2049'}));
 assert.equal(result.status,413);assert.equal(h.queries.length,0);
});
test('rejects malformed Content-Length before DB reads',async()=>{
 const h=harness();const result=await h.POST(request('{}',{'content-length':'garbled'}));
 assert.equal(result.status,400);assert.equal(result.body.code,'INVALID_INPUT');assert.equal(h.queries.length,0);
});
test('rejects malformed JSON and arrays before DB reads',async()=>{
 const h=harness();for(const body of ['{','[]','']){const result=await h.POST(request(body));assert.equal(result.status,400);}
 assert.equal(h.queries.length,0);
});
test('UTF-8 Arabic content is limited by bytes',async()=>{
 const h=harness();const result=await h.POST(request(JSON.stringify({...valid,description:'مرحبا'.repeat(300)})));
 assert.equal(result.status,413);assert.equal(h.queries.length,0);
});
test('rejects unauthenticated and wrong-origin POST before DB access',async()=>{
 for(const opts of [{session:null},{origin:false}]){const h=harness(opts);const result=await h.POST(request(JSON.stringify(valid)));assert.ok([401,403].includes(result.status));assert.equal(h.queries.length,0);}
});
test('source uses bounded reader and preserves role, branch and PIN checks',()=>{
 assert.doesNotMatch(source,/request\.json\(\)/);
 assert.match(source,/readLimitedJson\(request,2048\)/);
 assert.match(source,/employee_branch_assignments/);
 assert.match(source,/requireAdditionalBranchUnlock/);
 assert.match(source,/tenant_id=\?/);
});
