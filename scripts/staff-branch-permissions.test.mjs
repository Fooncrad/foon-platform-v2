import test from 'node:test';
import assert from 'node:assert/strict';
import {staffCan,staffBranchPermissions} from '../lib/restaurant/staff-grants.ts';
import {assignedServiceAlerts} from '../lib/restaurant/assigned-service-alerts.ts';
const grant=(permission_key,allowed=1,branch_id='a')=>({permission_key,allowed,branch_id});
test('branch selector cannot union employee grants from different branches',()=>{
 const grants=[grant('tables.view'),grant('orders.view',1,'b')];
 assert.deepEqual(staffBranchPermissions(grants,'a'),['tables.view']);
 assert.deepEqual(staffBranchPermissions(grants,'b'),['orders.view']);
 assert.deepEqual(staffBranchPermissions(grants,null),[]);
 assert.equal(staffCan(grants,'c','tables'),false);
});
test('explicit denial wins and resolved grants cannot reopen denied actions via manage',()=>{
 const grants=[grant('tables.manage',1,null),grant('tables.edit',0),grant('tables.view',0)];
 assert.equal(staffCan(grants,'a','tables'),false);
 assert.equal(staffCan(grants,'a','tables','edit'),false);
 const resolved=staffBranchPermissions(grants,'a');
 assert(!resolved.includes('tables.manage'));
 assert(!resolved.includes('tables.edit'));
 assert(resolved.includes('tables.create'));
 assert.equal(staffCan(grants,'b','tables'),true);
});
test('missing or revoked permissions deny all staff modules',()=>{
 for(const module of ['tables','orders','pos','kitchen','reports','security'])assert.equal(staffCan([], 'a',module),false);
 assert.equal(staffCan([grant('waiterCalls.accept')],'a','waiterCalls'),false);
});
test('table alerts require a previous scoped snapshot and only report changed assigned tables',()=>{
 const previous={tables:[{id:'1',name:'One',status:'available'}],calls:[{id:'old'}]};
 const next={tables:[{id:'1',name:'One',status:'occupied'},{id:'2',name:'Two',status:'reserved'}],calls:[{id:'old'},{id:'new'}]};
 assert.deepEqual(assignedServiceAlerts(null,next),[]);
 assert.deepEqual(assignedServiceAlerts(previous,previous),[]);
 assert.deepEqual(assignedServiceAlerts(previous,next),[{id:'1',kind:'table',name:'One',status:'occupied'},{id:'new',kind:'call',name:'',status:'pending'}]);
});
