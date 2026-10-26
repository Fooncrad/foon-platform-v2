import test from 'node:test';
import assert from 'node:assert/strict';
import {employeeGrantsNeedRevocation} from '../lib/restaurant/employee-grant-policy.ts';

const branchA='00000000-0000-4000-8000-000000000001';
const branchB='00000000-0000-4000-8000-000000000002';

test('unchanged staff role and branch preserve explicit grants',()=>{
 assert.equal(employeeGrantsNeedRevocation('waiter','waiter',branchA,branchA),false);
});
test('cashier to waiter revokes stale POS and financial grants',()=>{
 assert.equal(employeeGrantsNeedRevocation('cashier','waiter',branchA,branchA),true);
});
test('waiter to cashier revokes stale waiter grants',()=>{
 assert.equal(employeeGrantsNeedRevocation('waiter','cashier',branchA,branchA),true);
});
test('supervisor and waiter are different resource roles even when membership aliases',()=>{
 assert.equal(employeeGrantsNeedRevocation('supervisor','waiter',branchA,branchA),true);
});
test('branch reassignment revokes old branch grants',()=>{
 assert.equal(employeeGrantsNeedRevocation('waiter','waiter',branchA,branchB),true);
});
test('missing legacy role fails closed on next save',()=>{
 assert.equal(employeeGrantsNeedRevocation(undefined,'waiter',branchA,branchA),true);
});
test('both role and branch changes revoke grants',()=>{
 assert.equal(employeeGrantsNeedRevocation('driver','cashier',branchA,branchB),true);
});
