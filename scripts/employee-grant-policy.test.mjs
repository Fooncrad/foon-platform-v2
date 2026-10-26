import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {employeeGrantsNeedRevocation} from '../lib/restaurant/employee-grant-policy.ts';

const branchA='00000000-0000-4000-8000-000000000001';
const branchB='00000000-0000-4000-8000-000000000002';
const scope=(resourceRole,membershipRole,branchId=branchA)=>({resourceRole,membershipRole,branchId});

test('unchanged staff role, membership and branch preserve explicit grants',()=>{
 assert.equal(employeeGrantsNeedRevocation(scope('waiter','waiter'),scope('waiter','waiter')),false);
});
test('cashier to waiter revokes POS and financial grants',()=>{
 assert.equal(employeeGrantsNeedRevocation(scope('cashier','cashier'),scope('waiter','waiter')),true);
});
test('waiter to cashier revokes waiter grants',()=>{
 assert.equal(employeeGrantsNeedRevocation(scope('waiter','waiter'),scope('cashier','cashier')),true);
});
test('supervisor and waiter are different resource roles despite membership alias',()=>{
 assert.equal(employeeGrantsNeedRevocation(scope('supervisor','waiter'),scope('waiter','waiter')),true);
});
test('branch reassignment revokes grants',()=>{
 assert.equal(employeeGrantsNeedRevocation(scope('waiter','waiter',branchA),scope('waiter','waiter',branchB)),true);
});
test('legacy missing resource role fails closed',()=>{
 assert.equal(employeeGrantsNeedRevocation(scope(undefined,'waiter'),scope('waiter','waiter')),true);
});
test('authoritative membership role drift revokes grants even if resource role is unchanged',()=>{
 assert.equal(employeeGrantsNeedRevocation(scope('waiter','cashier'),scope('waiter','waiter')),true);
});
test('legacy missing membership role fails closed',()=>{
 assert.equal(employeeGrantsNeedRevocation(scope('waiter',undefined),scope('waiter','waiter')),true);
});
test('both role and branch changes revoke grants',()=>{
 assert.equal(employeeGrantsNeedRevocation(scope('driver','driver',branchA),scope('cashier','cashier',branchB)),true);
});
test('operation route binds grant revocation to tenant and user before assignment update',()=>{
 const src=readFileSync(new URL('../lib/restaurant/operations.ts',import.meta.url),'utf8');
 const segment=src.split('if(module==="team"){')[1]?.split('if(module==="purchases"){')[0];
 assert.ok(segment,'team mutation must exist');
 assert.match(segment,/employeeGrantsNeedRevocation\(/);
 assert.match(segment,/membershipRole:members\[0\]\.role/);
 assert.match(segment,/DELETE FROM employee_permission_grants WHERE tenant_id=\? AND user_id=\?/);
 assert.match(segment,/DELETE FROM employee_branch_assignments WHERE tenant_id=\? AND user_id=\?/);
 assert.match(segment,/if\(branchChanged\)\{/);
 assert.match(segment,/SELECT role FROM memberships WHERE tenant_id=\? AND user_id=\? AND status='active' FOR UPDATE/);
});
