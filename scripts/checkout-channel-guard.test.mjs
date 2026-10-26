import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutPolicy,checkoutTotals} from '../lib/restaurant/checkout-pricing.ts';

const policy=checkoutPolicy({checkoutServiceFee:3,checkoutDeliveryFee:10,checkoutRoomServiceFee:7});

test('all four canonical checkout channels retain their configured charges',()=>{
 assert.equal(checkoutTotals(100,0,'takeaway',policy).total,103);
 assert.equal(checkoutTotals(100,0,'dine_in',policy).total,103);
 assert.equal(checkoutTotals(100,0,'delivery',policy).total,113);
 assert.equal(checkoutTotals(100,0,'room_service',policy).total,110);
});

test('unknown channels cannot silently omit delivery or hotel fees',()=>{
 for(const channel of ['', 'DELIVERY', 'deliveri', 'room-service', 'service', 'toString', '__proto__']){
  assert.throws(()=>checkoutTotals(100,0,channel,policy),/INVALID_CHECKOUT_CHANNEL/,channel);
 }
});

test('coercible JSON arrays and objects cannot select a checkout channel',()=>{
 for(const channel of [['delivery'],['room_service'],{toString:()=> 'delivery'},null,42]){
  assert.throws(()=>checkoutTotals(100,0,channel,policy),/INVALID_CHECKOUT_CHANNEL/);
 }
});

test('VAT and delivery charges remain unchanged for valid checkout channel',()=>{
 const taxed=checkoutPolicy({vatEnabled:'yes',vatRate:15,checkoutDeliveryFee:10});
 const total=checkoutTotals(100,0,'delivery',taxed);
 assert.equal(total.deliveryFee,10);
 assert.equal(total.tax,15);
 assert.equal(total.total,125);
});
