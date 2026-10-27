import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {canReadReceipt} from '../lib/restaurant/receipt-access.ts';
const source=readFileSync(new URL('../lib/restaurant/receipt-authorization.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
function access({membershipRole='cashier',assignmentRole='cashier',assignmentRows,grants=[{permission_key:'orders.view',allowed:1,branch_id:null}],memberDenied=false}={}){
 const calls=[];
 const database=()=>({execute:async(sql,params)=>{
  calls.push({sql,params});
  if(sql.includes('employee_branch_assignments'))return [assignmentRows??(assignmentRole===null?[]:[{role:assignmentRole}])];
  if(sql.includes('employee_permission_grants'))return [grants];
  throw Error('Unexpected SQL');
 }});
 const exports={};
 const require=(id)=>{
  if(id==='@/lib/db/mysql')return {database};
  if(id==='@/lib/auth/authorization')return {requireTenantMembership:async(u,t,roles)=>{
   if(memberDenied||!roles.includes(membershipRole))throw Error('FORBIDDEN');
   return {role:membershipRole};
  }};
  if(id==='./receipt-access')return {canReadReceipt};
  throw Error('Unexpected import: '+id);
 };
 vm.runInNewContext(compiled.outputText,{exports,require});
 return {run:()=>exports.canReadStaffReceipt('user-1','tenant-1','branch-1'),calls};
}
test('server permits exact role and branch with financial grant',async()=>{
 for(const role of ['cashier','accountant']){const x=access({membershipRole:role,assignmentRole:role});assert.equal(await x.run(),true);assert.equal(x.calls.length,2);assert.deepEqual(Array.from(x.calls[0].params),['tenant-1','user-1','branch-1']);}
});
test('server denies stale/mismatched assignment, no assignment and duplicate assignments',async()=>{
 for(const role of ['waiter','driver','accountant'])assert.equal(await access({membershipRole:'cashier',assignmentRole:role}).run(),false);
 assert.equal(await access({assignmentRole:null}).run(),false);
 assert.equal(await access({assignmentRows:[{role:'cashier'},{role:'cashier'}]}).run(),false);
});
test('server denies foreign branch grant and explicit denial',async()=>{
 assert.equal(await access({grants:[{permission_key:'orders.view',allowed:1,branch_id:'branch-2'}]}).run(),false);
 assert.equal(await access({grants:[{permission_key:'orders.view',allowed:0,branch_id:'branch-1'}]}).run(),false);
});
test('server denies invalid membership and keeps owner/manager bypass',async()=>{
 assert.equal(await access({memberDenied:true}).run(),false);
 for(const role of ['owner','manager']){const x=access({membershipRole:role,assignmentRole:null});assert.equal(await x.run(),true);assert.equal(x.calls.length,0);}
});
