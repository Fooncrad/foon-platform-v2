import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultFloorBookingPolicy, parseFloorBookingPolicy, canSelectFloorSeat} from '../lib/restaurant/floor-booking-policy.ts';

const base = (patch={}) => ({...defaultFloorBookingPolicy, ...patch});

test('default disabled policy with zero fee can be saved without changes', () => {
  assert.deepEqual(parseFloorBookingPolicy(base()), defaultFloorBookingPolicy);
});

test('disabled policy can store a positive fee without activating booking', () => {
  assert.deepEqual(parseFloorBookingPolicy(base({bookingFee: 25.50})), base({bookingFee: 25.50}));
});

test('normal two-decimal fees are accepted despite IEEE-754 representation', () => {
  for (const fee of [0.07, 0.29, 0.58, 10.99, 99999.99]) {
    assert.equal(parseFloorBookingPolicy(base({bookingFee:fee}))?.bookingFee, fee, String(fee));
  }
});

test('fractions smaller than one cent are rejected', () => {
  for (const fee of [0.001, 0.009, 0.071, 1.005, 99.999]) {
    assert.equal(parseFloorBookingPolicy(base({bookingFee:fee})), null, String(fee));
  }
});

test('invalid, negative, and over-limit fee values are rejected', () => {
  for (const fee of [-1, -0.01, 100000.01, NaN, Infinity, '0.07', null]) {
    assert.equal(parseFloorBookingPolicy(base({bookingFee:fee})), null, String(fee));
  }
});

test('enabled policy still requires a positive booking fee', () => {
  assert.equal(parseFloorBookingPolicy(base({enabled:true,bookingFee:0})), null);
  assert.equal(parseFloorBookingPolicy(base({enabled:true,bookingFee:0.01}))?.bookingFee, 0.01);
});

test('enums must be strings, not arrays or objects coercible to valid names', () => {
  for (const patch of [
    {orderPolicy:['optional']}, {refundPolicy:['restaurant']},
    {orderPolicy:{0:'optional'}}, {refundPolicy:42},
  ]) assert.equal(parseFloorBookingPolicy(base({bookingFee:1, ...patch})), null);
});

test('valid enum combinations are accepted', () => {
  for (const orderPolicy of ['optional','required','disabled']) {
    for (const refundPolicy of ['restaurant','nonrefundable']) {
      assert.ok(parseFloorBookingPolicy(base({orderPolicy,refundPolicy})));
    }
  }
});

test('session duration must be an integer from 30 through 360 minutes', () => {
  for (const minutes of [29, 361, 90.5, '90', NaN, null]) {
    assert.equal(parseFloorBookingPolicy(base({sessionMinutes:minutes})), null);
  }
  for (const minutes of [30, 90, 360]) assert.ok(parseFloorBookingPolicy(base({sessionMinutes:minutes})));
});

test('reject missing and malformed policy bodies', () => {
  for (const value of [null, [], {}, 'foo', 12, base({enabled:'false'}), base({orderPolicy:'any'}), base({refundPolicy:'any'})]) {
    assert.equal(parseFloorBookingPolicy(value), null);
  }
});

test('classic reservations cannot bypass the floor booking gate', () => {
  assert.equal(canSelectFloorSeat({channel:'classic',feePaid:true,seatAvailable:true,layoutLinked:true,policyEnabled:true}),false);
});

test('floor selection requires all payment, availability, linking and policy gates', () => {
  const valid={channel:'floor',feePaid:true,seatAvailable:true,layoutLinked:true,policyEnabled:true};
  assert.equal(canSelectFloorSeat(valid),true);
  for (const key of ['feePaid','seatAvailable','layoutLinked','policyEnabled']) {
    assert.equal(canSelectFloorSeat({...valid,[key]:false}),false,key);
  }
});
