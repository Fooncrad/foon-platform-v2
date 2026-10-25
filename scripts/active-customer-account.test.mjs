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

// Protect route wiring as well as the helper: a passing helper unit test alone
// cannot detect a future route that forgets to call it.
test('customer GET routes retain active-user gate before data reads', async () => {
  const {readFile} = await import('node:fs/promises');
  for (const route of ['services', 'service-requests', 'order-revision']) {
    const source = await readFile(new URL(`../app/api/customer/${route}/route.ts`, import.meta.url), 'utf8');
    const get = source.split('export async function GET')[1]?.split('export async function POST')[0] ?? '';
    assert.match(get, /if\(!await activeCustomerAccount\(/, route);
  }
});
test('customer store enrollment locks active user before creating tenant links', async () => {
  const {readFile} = await import('node:fs/promises');
  const source = await readFile(new URL('../app/api/customer/join-store/route.ts', import.meta.url), 'utf8');
  const transaction = source.indexOf('await connection.beginTransaction()');
  const gate = source.indexOf('activeCustomerAccount(connection,userId,true)');
  const insert = source.indexOf('INSERT IGNORE INTO tenant_customers');
  assert.ok(transaction >= 0 && gate > transaction && insert > gate);
});
