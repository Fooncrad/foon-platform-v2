import test from 'node:test';
import assert from 'node:assert/strict';
import { orderStatusTransitionAllowed } from '../lib/restaurant/order-status-transition.mjs';

test('allows the existing order lifecycle transitions', () => {
  for (const [from, to] of [['new','preparing'],['new','cancelled'],['preparing','ready'],['preparing','cancelled'],['ready','completed'],['ready','cancelled']]) {
    assert.equal(orderStatusTransitionAllowed(from,to), true, `${from} -> ${to}`);
  }
});
test('rejects completed, cancelled and invalid lifecycle transitions', () => {
  for (const [from,to] of [['new','completed'],['ready','preparing'],['completed','cancelled'],['cancelled','new'],['new','new']]) {
    assert.equal(orderStatusTransitionAllowed(from,to), false, `${from} -> ${to}`);
  }
});
test('rejects legacy or unexpected stored statuses without throwing', () => {
  for (const from of ['delivered','refunded','rejected','__proto__','constructor','toString','']) {
    assert.equal(orderStatusTransitionAllowed(from,'cancelled'), false, from);
  }
});
test('rejects malformed status values without coercing them', () => {
  for (const status of [null,undefined,0,[],{},true]) {
    assert.equal(orderStatusTransitionAllowed(status,'cancelled'), false);
    assert.equal(orderStatusTransitionAllowed('new',status), false);
  }
});
