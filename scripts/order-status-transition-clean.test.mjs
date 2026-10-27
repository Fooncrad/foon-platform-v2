import test from 'node:test';
import assert from 'node:assert/strict';
import {orderStatusTransitionAllowed,orderPaymentTransitionAllowed} from '../lib/restaurant/order-status-transition.mjs';

test('preserves the six allowed transitions',()=>{
  for(const [from,to] of [['new','preparing'],['new','cancelled'],['preparing','ready'],['preparing','cancelled'],['ready','completed'],['ready','cancelled']]){
    assert.equal(orderStatusTransitionAllowed(from,to),true,`${from} -> ${to}`);
  }
});
test('rejects illegal transitions and terminal state changes',()=>{
  for(const [from,to] of [['new','completed'],['new','new'],['preparing','completed'],['ready','new'],['completed','cancelled'],['cancelled','new']]){
    assert.equal(orderStatusTransitionAllowed(from,to),false,`${from} -> ${to}`);
  }
});
test('fails closed for unexpected stored statuses, including inherited object keys',()=>{
  for(const from of ['delivered','refunded','rejected','__proto__','constructor','toString','']){
    assert.doesNotThrow(()=>orderStatusTransitionAllowed(from,'cancelled'));
    assert.equal(orderStatusTransitionAllowed(from,'cancelled'),false,from);
  }
});
test('rejects coercible or malformed values',()=>{
  for(const value of [null,undefined,0,1,[],['paid'],['preparing'],{},true]){
    assert.equal(orderStatusTransitionAllowed(value,'cancelled'),false);
    assert.equal(orderStatusTransitionAllowed('new',value),false);
  }
});
test('does not mutate the transition table through inherited properties',()=>{
  assert.equal(orderStatusTransitionAllowed('new','__proto__'),false);
  assert.equal(orderStatusTransitionAllowed('__proto__','preparing'),false);
  assert.equal(orderStatusTransitionAllowed('toString','preparing'),false);
});

test('preserves allowed payment transitions without coercion',()=>{
  assert.equal(orderPaymentTransitionAllowed('unpaid','paid','new'),true);
  assert.equal(orderPaymentTransitionAllowed('unpaid','paid','completed'),true);
  assert.equal(orderPaymentTransitionAllowed('paid','refunded','completed'),true);
  assert.equal(orderPaymentTransitionAllowed('unpaid','paid','cancelled'),false);
  assert.equal(orderPaymentTransitionAllowed('unpaid','refunded','new'),false);
  assert.equal(orderPaymentTransitionAllowed('paid','paid','ready'),false);
});
test('rejects malformed payment transition inputs instead of coercing JSON values',()=>{
  for(const value of [null,undefined,0,1,[],['paid'],{},true,'__proto__','constructor','toString']){
    assert.equal(orderPaymentTransitionAllowed('unpaid',value,'new'),false);
    assert.equal(orderPaymentTransitionAllowed(value,'paid','new'),false);
    assert.equal(orderPaymentTransitionAllowed('unpaid','paid',value),false);
  }
});
