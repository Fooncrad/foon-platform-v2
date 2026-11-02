import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {resourceModules,ResourceError} from './restaurant-resource-schema.mjs';
const source=readFileSync(new URL('../app/api/restaurant/operations/[module]/route.ts',import.meta.url),'utf8')+'\nexport {authorize};';
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
// Load the production selector so the isolated authorization harness exercises the real branch rules.
const branchSelectionExports={};
const branchSelectionSource=readFileSync(new URL('../lib/restaurant/operations-branch-selection.ts',import.meta.url),'utf8');
vm.runInNewContext(ts.transpileModule(branchSelectionSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:branchSelectionExports});
function harness({role='waiter',assignmentRole=role,grants=[{permission_key:'orders.view',allowed:1,branch_id:'a'}],assigned=true}={}){
 const exports={};const database=()=>({execute:async(sql)=>{
  if(sql.includes('employee_permission_grants'))return [grants];
  if(sql.includes('employee_branch_assignments'))return [assigned?[{role:assignmentRole,branch_id:'a'}]:[]];
  throw Error(sql);
 }});
 const imports={
 '@/lib/auth/session':{currentUserId:async()=> 'user'},
 '@/lib/auth/authorization':{requireTenantMembership:async(u,t,allowed)=>{if(!allowed.includes(role))throw Error();return {tenantId:t,role};}},
 '@/lib/db/mysql':{database},
 '@/lib/restaurant/branch-pin':{requireAdditionalBranchUnlock:async()=>{}},
 '@/lib/restaurant/operations-branch-selection':branchSelectionExports,
 '@/lib/plans/entitlements':{tenantEntitlement:async()=>({enabled:true})},
 '@/lib/security/origin':{assertSameOrigin:()=>{}},
 '@/scripts/restaurant-resource-schema.mjs':{resourceModules,ResourceError}
 };
 vm.runInNewContext(code,{exports,require:id=>imports[id]??{},URL,console});
 return (module='orders',branch='a',method='GET',query=branch)=>exports.authorize(new Request(`https://example.test/api?branch=${query}`,{method,headers:{'x-foon-tenant':'tenant','x-foon-branch':branch}}),module,method!=='GET');
}
test('actual operations authorization denies other branch, revoked grants and stale assignment roles',async()=>{
 await assert.rejects(harness()('orders','b'));
 await assert.rejects(harness({grants:[]})());
 await assert.rejects(harness({assignmentRole:'cashier'})());
 await assert.rejects(harness({assigned:false})());
 await assert.rejects(harness()('orders','a','GET','b'));
 await assert.rejects(harness({grants:[{permission_key:'orders.manage',allowed:1,branch_id:null},{permission_key:'orders.view',allowed:0,branch_id:'a'}]})());
});
test('actual operations authorization retains granted branch and blocks staff floor administration',async()=>{
 const context=await harness()();assert.equal(context.authorizedBranch,'a');
 await assert.rejects(harness({grants:[{permission_key:'tables.manage',allowed:1,branch_id:'a'}]})('tables','a','POST'));
 const owner=await harness({role:'owner',assigned:false,grants:[]})('tables','a','POST');assert.equal(owner.role,'owner');
});

test("financial reports cannot be opened by a waiter even with an explicit report grant",async()=>{await assert.rejects(harness({grants:[{permission_key:"reports.view",allowed:1,branch_id:"a"}] })("reports"));});
