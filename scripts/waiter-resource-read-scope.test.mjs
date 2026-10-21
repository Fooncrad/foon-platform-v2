import test from 'node:test';
import assert from 'node:assert/strict';
import {scopeWaiterDiningRead, waiterAssignedSectionIds} from '../lib/restaurant/waiter-resource-read-scope.mjs';

const tables = [
  {id:'table-1',data:{sectionId:'section-1'}},
  {id:'table-2',data:{sectionId:'section-2'}},
  {id:'table-3',data:{sectionId:'section-1'}}
];
const ids = (rows) => rows.map((r) => r.id);

test('table read exposes only assigned tables', () => {
  assert.deepEqual(ids(scopeWaiterDiningRead('tables',tables,['table-1'])),['table-1']);
});
test('section read exposes sections containing an assigned table only', () => {
  const sections = [{id:'section-1'},{id:'section-2'}];
  const assigned = waiterAssignedSectionIds(tables,['table-1']);
  assert.deepEqual(assigned,['section-1']);
  assert.deepEqual(ids(scopeWaiterDiningRead('sections',sections,['table-1'],assigned)),['section-1']);
});
test('shared section is not exposed if no table is assigned', () => {
  assert.deepEqual(waiterAssignedSectionIds(tables,[]),[]);
  assert.deepEqual(scopeWaiterDiningRead('sections',[{id:'section-1'}],[],[]),[]);
});
test('waiter calls require assigned table', () => {
  const calls = [{id:'c1',data:{tableId:'table-1'}},{id:'c2',data:{tableId:'table-2'}},{id:'c3',data:{}}];
  assert.deepEqual(ids(scopeWaiterDiningRead('waiterCalls',calls,['table-1'])),['c1']);
});
test('reservations with absent, numeric or foreign table IDs are hidden', () => {
  const bookings = [{id:'r1',data:{tableId:'table-1'}},{id:'r2',data:{tableId:'table-2'}},{id:'r3',data:{}},{id:'r4',data:{tableId:1}}];
  assert.deepEqual(ids(scopeWaiterDiningRead('reservations',bookings,['table-1'])),['r1']);
});
test('no assignments fail closed for all protected modules', () => {
  for (const module of ['sections','tables','waiterCalls','reservations']) {
    assert.deepEqual(scopeWaiterDiningRead(module,[{id:'table-1',data:{tableId:'table-1'}}],[],[]),[]);
  }
});
test('unrelated modules are unchanged and keep object identity', () => {
  assert.equal(scopeWaiterDiningRead('menu',tables,[]),tables);
});
test('section IDs are deduplicated and foreign table assignments ignored', () => {
  assert.deepEqual(waiterAssignedSectionIds(tables,['table-1','table-3','foreign']),['section-1']);
});
