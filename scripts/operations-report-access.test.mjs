import test from 'node:test';
import assert from 'node:assert/strict';
import {financialReportRoles,canAccessFinancialReports} from '../lib/restaurant/report-access.ts';

const financial=['owner','manager','cashier','accountant'];
const nonFinancial=['waiter','kitchen','driver','customer','creator','super_admin','unknown',''];

test('only financial tenant roles can read revenue reports',()=>{
 assert.deepEqual([...financialReportRoles],financial);
 for(const role of financial)assert.equal(canAccessFinancialReports(role),true,role);
 for(const role of nonFinancial)assert.equal(canAccessFinancialReports(role),false,role);
});

test('report role list is not accidentally expanded or mutated by consumers',()=>{
 assert.equal(financialReportRoles.includes('waiter'),false);
 assert.equal(financialReportRoles.includes('driver'),false);
 assert.equal(financialReportRoles.includes('kitchen'),false);
});
