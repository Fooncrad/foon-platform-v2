import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serviceOrderTransitionAllowed,serviceOrderArchiveAllowed} from '../lib/restaurant/service-order-policy.ts';

const statuses=['new','scheduled','in_progress','completed','cancelled'];
const allowed={
 new:['new','scheduled','in_progress','cancelled'],
 scheduled:['scheduled','in_progress','cancelled'],
 in_progress:['in_progress','completed','cancelled'],
 completed:['completed'],
 cancelled:['cancelled'],
};

test('creation cannot skip execution or start in a final state',()=>{
 for(const status of statuses)assert.equal(serviceOrderTransitionAllowed(null,status),['new','scheduled'].includes(status),status);
});

test('every service order state transition follows the lifecycle',()=>{
 for(const from of statuses)for(const to of statuses){
  assert.equal(serviceOrderTransitionAllowed(from,to),allowed[from].includes(to),`${from} -> ${to}`);
 }
});

test('unknown states fail closed, including inherited object properties',()=>{
 for(const unknown of ['','active','COMPLETED','toString','constructor','__proto__']){
  assert.equal(serviceOrderTransitionAllowed(null,unknown),false);
  assert.equal(serviceOrderTransitionAllowed(unknown,'new'),false);
  assert.equal(serviceOrderTransitionAllowed('new',unknown),false);
  assert.equal(serviceOrderArchiveAllowed(unknown),false);
 }
});

test('scheduled, running and final orders cannot be archived',()=>{
 for(const status of statuses)assert.equal(serviceOrderArchiveAllowed(status),status==='new',status);
});
