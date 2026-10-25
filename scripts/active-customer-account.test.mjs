import test from 'node:test';
import assert from 'node:assert/strict';
import {activeCustomerAccount} from '../lib/auth/active-customer-account.mjs';

const makeDb = (rows) => ({
  calls: [],
  async execute(sql, params) { this.calls.push({sql, params}); return [rows]; }
});

test('active customer is accepted with parameterized query', async () => {
  const db = makeDb([{id:'customer-a'}]);
  assert.equal(await activeCustomerAccount(db, 'customer-a'), true);
  assert.deepEqual(db.calls[0].params, ['customer-a']);
  assert.match(db.calls[0].sql, /status='active'/);
  assert.doesNotMatch(db.calls[0].sql, /FOR UPDATE/);
});
test('suspended or missing customer is denied', async () => {
  const db = makeDb([]);
  assert.equal(await activeCustomerAccount(db, 'suspended'), false);
  assert.equal(await activeCustomerAccount(db, 'deleted'), false);
});
test('tenant enrollment locks active customer account before write', async () => {
  const db = makeDb([{id:'customer-a'}]);
  assert.equal(await activeCustomerAccount(db, 'customer-a', true), true);
  assert.match(db.calls[0].sql, /FOR UPDATE$/);
});
test('empty identifiers are denied without querying', async () => {
  const db = makeDb([{id:'customer-a'}]);
  assert.equal(await activeCustomerAccount(db, ''), false);
  assert.equal(await activeCustomerAccount(db, null), false);
  assert.equal(db.calls.length, 0);
});
test('database errors propagate so callers can fail closed with 503', async () => {
  const db = {async execute() {throw new Error('db offline');}};
  await assert.rejects(activeCustomerAccount(db, 'customer-a'), /db offline/);
});
