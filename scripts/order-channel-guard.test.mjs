import test from 'node:test';
import assert from 'node:assert/strict';
import {orderChannelStatus} from '../lib/restaurant/order-channel-policy.ts';

const enabled={};
test('all four known order channels remain accepted when enabled',()=>{
 for(const channel of ['delivery','takeaway','dine_in','room_service']){
  assert.equal(orderChannelStatus(enabled,enabled,channel).allowed,true,channel);
 }
});
test('disabled channel remains blocked by tenant and branch settings',()=>{
 assert.equal(orderChannelStatus({deliveryEnabled:'no'}, {},'delivery').reason,'ORDER_CHANNEL_DISABLED');
 assert.equal(orderChannelStatus({}, {roomServiceEnabled:'no'},'room_service').reason,'ORDER_CHANNEL_DISABLED');
});
test('unknown string channels fail closed',()=>{
 for(const channel of ['deliveri','pickup','hotel_service','','constructor','__proto__','toString']){
  assert.deepEqual(orderChannelStatus(enabled,enabled,channel),{allowed:false,reason:'ORDER_CHANNEL_DISABLED'},String(channel));
 }
});
test('non-string JSON channels cannot coerce into known keys',()=>{
 for(const channel of [['delivery'],['room_service'],{toString:()=> 'delivery'},null,undefined,0]){
  assert.deepEqual(orderChannelStatus(enabled,enabled,channel),{allowed:false,reason:'ORDER_CHANNEL_DISABLED'},String(channel));
 }
});
test('global order kill switch remains first and takes precedence',()=>{
 assert.equal(orderChannelStatus({ordersEnabled:'no'},{},'bad').reason,'ORDERS_DISABLED');
});
test('valid delivery channel still honors opening hours',()=>{
 assert.equal(orderChannelStatus({}, {openingTime:'09:00',closingTime:'17:00',timeZone:'UTC'},'delivery',new Date('2026-10-27T17:00:00Z')).reason,'STORE_CLOSED');
});
