import test from 'node:test';
import assert from 'node:assert/strict';
import {canReadReceipt} from '../lib/restaurant/receipt-access.ts';
const base={role:'cashier',assigned:true,assignmentRole:'cashier',branchId:'branch-a',grants:[{permission_key:'orders.view',allowed:1,branch_id:null}]};
test('receipt financial access follows management and assigned staff permissions',()=>{
 assert.equal(canReadReceipt({...base,role:'owner',assigned:false,assignmentRole:null,grants:[]}),true);
 assert.equal(canReadReceipt({...base,role:'manager',assigned:false,assignmentRole:null,grants:[]}),true);
 assert.equal(canReadReceipt(base),true);
 assert.equal(canReadReceipt({...base,role:'accountant',assignmentRole:'accountant'}),true);
 for(const role of ['waiter','driver','kitchen','customer'])assert.equal(canReadReceipt({...base,role,assignmentRole:role}),false);
});
test('foreign branches, missing grants and exact denials remain closed',()=>{
 assert.equal(canReadReceipt({...base,assigned:false}),false);
 assert.equal(canReadReceipt({...base,grants:[]}),false);
 assert.equal(canReadReceipt({...base,grants:[{permission_key:'orders.view',allowed:1,branch_id:'branch-b'}]}),false);
 assert.equal(canReadReceipt({...base,grants:[{permission_key:'orders.manage',allowed:1,branch_id:null},{permission_key:'orders.view',allowed:0,branch_id:'branch-a'}]}),false);
});
test('staff receipts reject stale or mismatched assignment roles despite surviving grants',()=>{
 for(const role of ['cashier','accountant']){
  for(const assignmentRole of ['waiter','kitchen','driver',role==='cashier'?'accountant':'cashier',null,undefined]){
   assert.equal(canReadReceipt({...base,role,assignmentRole}),false,`${role} vs ${assignmentRole}`);
  }
 }
});
test('only exact active assignment role with grants permits financial receipt access',()=>{
 assert.equal(canReadReceipt({...base,role:'cashier',assignmentRole:'cashier'}),true);
 assert.equal(canReadReceipt({...base,role:'accountant',assignmentRole:'accountant'}),true);
 assert.equal(canReadReceipt({...base,role:'accountant',assignmentRole:'cashier'}),false);
 assert.equal(canReadReceipt({...base,role:'cashier',assignmentRole:'accountant'}),false);
});

import {readFileSync} from 'node:fs';
test('server authorization binds the active assignment role and fails closed on duplicate assignments',()=>{
 const source=readFileSync(new URL('../lib/restaurant/receipt-authorization.ts',import.meta.url),'utf8');
 assert.match(source,/SELECT role FROM employee_branch_assignments WHERE tenant_id=\? AND user_id=\? AND branch_id=\? AND enabled=TRUE LIMIT 2/);
 assert.match(source,/assigned:assigned\.length===1/);
 assert.match(source,/assignmentRole:assigned\.length===1\?String\(assigned\[0\]\.role\):null/);
});
