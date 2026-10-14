import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateTax,calculateOrderTax} from '../lib/restaurant/tax-calculation.ts';

const minor=value=>Math.round(value*100);

test('zero and maximum valid tax rates preserve monetary invariants',()=>{
 for(const rate of [0,5,15,100])for(const inclusive of [false,true])for(let cents=0;cents<=1000;cents++){
  const value=cents/100;
  const {net,tax,gross}=calculateTax(value,rate,inclusive);
  assert.equal(minor(net)+minor(tax),minor(gross));
  assert.equal(minor(inclusive?gross:net),cents);
  assert.ok(tax>=0);
 }
});

test('discounts cannot produce a negative total or change inclusive gross',()=>{
 for(const inclusive of [false,true])for(let cents=0;cents<=1000;cents+=7){
  const subtotal=cents/100;
  for(const discountCents of [0,Math.floor(cents/2),cents]){
   const result=calculateOrderTax(subtotal,discountCents/100,15,inclusive);
   assert.equal(minor(result.net)+minor(result.tax),minor(result.gross));
   assert.ok(result.net>=0&&result.tax>=0&&result.gross>=0);
   if(inclusive)assert.equal(minor(result.gross),cents-discountCents);
  }
 }
});

test('rates outside 0–100 and discounts exceeding subtotal are rejected',()=>{
 for(const rate of [-0.01,100.01,Number.NaN,Number.POSITIVE_INFINITY]){
  assert.throws(()=>calculateTax(1,rate),RangeError);
 }
 assert.throws(()=>calculateOrderTax(0.01,0.02,15),RangeError);
});
