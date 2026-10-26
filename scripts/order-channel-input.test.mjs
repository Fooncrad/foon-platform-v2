import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {validOrderChannel,orderChannelStatus} from '../lib/restaurant/order-channel-policy.ts';

const channels=['delivery','takeaway','dine_in','room_service'];
test('only exact string channels are valid',()=>{
 for(const channel of channels)assert.equal(validOrderChannel(channel),true,channel);
});
test('arrays cannot impersonate delivery, dine-in or hotel channels',()=>{
 for(const channel of channels){
  const forged=[channel];
  assert.equal(String(forged),channel); // Demonstrates the former coercion pitfall.
  assert.equal(validOrderChannel(forged),false);
  assert.deepEqual(orderChannelStatus({}, {}, forged),{allowed:false,reason:'INVALID_ORDER_CHANNEL'});
 }
});
test('invalid primitive, object and prototype names fail closed',()=>{
 for(const input of [null,undefined,0,true,{},new String('delivery'),'__proto__','constructor','DELIVERY','', ['delivery','takeaway']]){
  assert.equal(validOrderChannel(input),false);
  assert.deepEqual(orderChannelStatus({}, {}, input),{allowed:false,reason:'INVALID_ORDER_CHANNEL'});
 }
});
test('valid channel availability settings remain enforced',()=>{
 for(const channel of channels)assert.equal(orderChannelStatus({}, {}, channel).allowed,true);
 assert.deepEqual(orderChannelStatus({}, {deliveryEnabled:'no'},'delivery'),{allowed:false,reason:'ORDER_CHANNEL_DISABLED'});
 assert.deepEqual(orderChannelStatus({ordersEnabled:'no'}, {},'takeaway'),{allowed:false,reason:'ORDERS_DISABLED'});
});
test('createOrder validates raw body.channel before conditional business logic',()=>{
 const source=readFileSync(new URL('../lib/restaurant/operations.ts',import.meta.url),'utf8');
 const start=source.indexOf('export async function createOrder(');
 const end=source.indexOf('export async function recordManualPaymentAtCreate(',start);
 assert.ok(start>=0&&end>start);
 const create=source.slice(start,end);
 assert.match(create,/!validOrderChannel\(body\.channel\)/);
 assert.doesNotMatch(create,/includes\(String\(body\.channel\)\)/);
 assert.match(create,/if\(body\.channel==="delivery"\)/);
 assert.match(create,/if\(body\.channel==="room_service"/);
});
