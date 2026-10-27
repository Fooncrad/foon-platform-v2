import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {staffCan} from '../lib/restaurant/staff-grants.ts';
import {readLimitedJson} from '../lib/security/limited-json.ts';
const source=readFileSync(new URL('../app/api/restaurant/assigned-service/route.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const tenant='11111111-1111-1111-1111-111111111111',branch='22222222-2222-2222-2222-222222222222',foreign='33333333-3333-3333-3333-333333333333';
function harness({role='waiter',assignmentRole=role,grants=[{permission_key:'tables.view',allowed:1,branch_id:branch}],ids=['mine'],pin=true,user='user',enabled=true,planEnabled=true}={}){
 const calls=[];const db={execute:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('employee_branch_assignments'))return [enabled?[{branch_id:branch,role:assignmentRole}]:[]];
  if(sql.includes('employee_permission_grants'))return [grants];
  if(sql.includes("kind='dining_table'"))return [[{id:'mine',name:'1',status:'occupied',branch_id:branch}]];
  if(sql.includes("kind='waiter_call'"))return [[{id:'call',name:'Call',status:'pending',data:{tableId:'mine'}}]];
  throw Error('Unexpected SQL '+sql);
 }};
 const exports={};const imports={
  'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
  '@/lib/auth/session':{currentUserId:async()=>user},
  '@/lib/auth/authorization':{requireTenantMembership:async(u,t,roles)=>{if(!roles.includes(role))throw Error();return {tenantId:t,role};}},
  '@/lib/db/mysql':{database:()=>db},
  '@/lib/plans/entitlements':{tenantEntitlement:async()=>({enabled:planEnabled})},
  '@/lib/security/origin':{assertSameOrigin:()=>{}},
  '@/lib/security/limited-json':{readLimitedJson},
  '@/lib/restaurant/branch-pin':{requireAdditionalBranchUnlock:async()=>{if(!pin)throw Error();}},
  '@/lib/restaurant/waiter-assignments':{assignedWaiterTableIds:async(d,t,b,u)=>{assert.equal(t,tenant);assert.equal(b,branch);assert.equal(u,'user');return ids;}},
  '@/lib/restaurant/staff-grants':{staffCan}
 };
 vm.runInNewContext(code,{exports,require:id=>{if(!(id in imports))throw Error(id);return imports[id];},Request,Response,URL,Error,console});
 return {get:(b=branch)=>exports.GET(new Request(`https://example.test/api/restaurant/assigned-service?tenantId=${tenant}&branch=${b}`)),post:(body={tenantId:tenant,branch,callId:foreign,action:'accept'},headers={})=>exports.POST(new Request('https://example.test/api/restaurant/assigned-service',{method:'POST',body:JSON.stringify(body),headers})),calls};
}
test('assigned API denies missing grant, foreign branch, stale role, disabled assignment, locked PIN and non-waiter',async()=>{
 for(const options of [{grants:[]},{planEnabled:false},{assignmentRole:'cashier'},{enabled:false},{pin:false},{role:'cashier'},{role:'owner'},{role:'manager'},{grants:[{permission_key:'tables.manage',allowed:1,branch_id:branch},{permission_key:'tables.view',allowed:0,branch_id:branch}]}])assert.equal((await harness(options).get()).status,403);
 assert.equal((await harness().get(foreign)).status,403);
 assert.equal((await harness({user:null}).get()).status,401);
});
test('tables grant returns only server-assigned IDs and never reads calls without call grant',async()=>{
 const h=harness();const r=await h.get();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');
 const body=await r.json();assert.equal(body.tables[0].id,'mine');assert.deepEqual(body.calls,[]);
 const query=h.calls.find(c=>c.sql.includes("kind='dining_table'"));assert.deepEqual(Array.from(query.args),[tenant,branch,'mine']);
 assert(!h.calls.some(c=>c.sql.includes("kind='waiter_call'")));
});
test('calls require separate view grant and queries bind tenant, branch and assigned IDs',async()=>{
 const h=harness({grants:[{permission_key:'tables.view',allowed:1,branch_id:branch},{permission_key:'waiterCalls.view',allowed:1,branch_id:branch}]});
 const body=await (await h.get()).json();assert.equal(body.calls.length,1);
 assert.deepEqual(Array.from(h.calls.find(c=>c.sql.includes("kind='waiter_call'")).args),[tenant,branch,'mine']);
});
test('empty assignments do not read tables or calls; call writes require their own action grant',async()=>{
 const h=harness({ids:[]});const body=await (await h.get()).json();assert.deepEqual(body.tables,[]);assert.deepEqual(body.calls,[]);
 assert.equal((await harness().post()).status,403);
});

test('assigned waiter POST enforces bounded JSON and rejects malformed lengths',async()=>{
 const h=harness();
 assert.equal((await h.post({tenantId:tenant,branch,callId:foreign,action:'accept',padding:'x'.repeat(1200)})).status,413);
 assert.equal((await h.post({tenantId:tenant,branch,callId:foreign,action:'accept'},{'content-length':'invalid'})).status,400);
});

test('assigned waiter POST rejects coerced action arrays before authorization',async()=>{
 const h=harness();
 for(const action of [['accept'],['complete'],null,{},true,1]){
  assert.equal((await h.post({tenantId:tenant,branch,callId:foreign,action})).status,400,JSON.stringify(action));
 }
});
