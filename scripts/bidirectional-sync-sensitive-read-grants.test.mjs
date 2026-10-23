import test from 'node:test';
import assert from 'node:assert/strict';
import {filterAuthorizedSyncEvents} from '../lib/platform/bidirectional-sync-authorization.mjs';

const ids = {
  device: '11111111-1111-4111-8111-111111111111',
  tenant: '22222222-2222-4222-8222-222222222222',
  branch: '33333333-3333-4333-8333-333333333333',
  actor: '44444444-4444-4444-8444-444444444444',
  foreign: '55555555-5555-4555-8555-555555555555',
};
const context = (grants, overrides = {}) => ({
  authenticated: true, enabled: true, revoked: false, suspended: false,
  expiresAt: '2099-01-01T00:00:00Z', deviceId: ids.device,
  tenantId: ids.tenant, branchId: ids.branch, actorId: ids.actor,
  grants, ...overrides,
});
const row = (entity_type, overrides = {}) => ({
  entity_type, tenant_id: ids.tenant, branch_id: ids.branch,
  payload_json: { secret: 'synthetic-private-data' }, ...overrides,
});

test('POS catalog reader cannot read customer, staff, orders or reservations', () => {
  const events = ['catalog_item','customer_reference','staff_assignment','order','reservation','waitlist'].map(t => row(t));
  assert.deepEqual(filterAuthorizedSyncEvents(context(['sync.read','catalog.read']), events), [events[0]]);
});
test('orders reader cannot inherit customer or staff PII grants', () => {
  const events = ['order','customer_reference','staff_assignment','reservation'].map(t => row(t));
  assert.deepEqual(filterAuthorizedSyncEvents(context(['sync.read','orders.read']), events), [events[0]]);
});
test('reservations reader cannot read orders, waitlist, customers or staff', () => {
  const events = ['reservation','order','waitlist','customer_reference','staff_assignment'].map(t => row(t));
  assert.deepEqual(filterAuthorizedSyncEvents(context(['sync.read','reservations.read']), events), [events[0]]);
});
test('staff reader cannot inherit order or customer access', () => {
  const events = ['staff_assignment','order','customer_reference'].map(t => row(t));
  assert.deepEqual(filterAuthorizedSyncEvents(context(['sync.read','staff.read']), events), [events[0]]);
});
test('foreign tenant or branch rows fail closed even with matching sensitive read grant', () => {
  const ctx = context(['sync.read','orders.read']);
  assert.throws(() => filterAuthorizedSyncEvents(ctx,[row('order',{tenant_id:ids.foreign})]), /SYNC_FEED_SCOPE_MISMATCH/);
  assert.throws(() => filterAuthorizedSyncEvents(ctx,[row('order',{branch_id:ids.foreign})]), /SYNC_FEED_SCOPE_MISMATCH/);
  assert.throws(() => filterAuthorizedSyncEvents(ctx,[row('order',{branch_id:null})]), /SYNC_FEED_SCOPE_MISMATCH/);
});
test('a mixed valid and foreign-tenant feed never returns a partial result', () => {
  const ctx = context(['sync.read','orders.read']);
  assert.throws(() => filterAuthorizedSyncEvents(ctx,[row('order'),row('order',{tenant_id:ids.foreign})]), /SYNC_FEED_SCOPE_MISMATCH/);
});
test('read requires sync.read and an active, unexpired device', () => {
  const events = [row('order')];
  assert.throws(() => filterAuthorizedSyncEvents(context(['orders.read']),events), /SYNC_READ_FORBIDDEN/);
  assert.throws(() => filterAuthorizedSyncEvents(context(['sync.read','orders.read'],{revoked:true}),events), /SYNC_DEVICE_DISABLED/);
  assert.throws(() => filterAuthorizedSyncEvents(context(['sync.read','orders.read'],{expiresAt:'2020-01-01T00:00:00Z'}),events), /SYNC_DEVICE_EXPIRED/);
});
