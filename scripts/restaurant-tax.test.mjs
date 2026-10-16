import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateTax,calculateOrderTax} from '../lib/restaurant/tax-calculation.ts';

const cents=value=>Math.round(value*100);

test('exclusive 15% VAT adds tax to net price',()=>{
  assert.deepEqual(calculateTax(100,15),{net:100,tax:15,gross:115});
  assert.deepEqual(calculateTax(0,15),{net:0,tax:0,gross:0});
});

test('inclusive 15% VAT extracts tax without changing charged price',()=>{
  assert.deepEqual(calculateTax(115,15,true),{net:100,tax:15,gross:115});
  assert.deepEqual(calculateTax(10,15,true),{net:8.7,tax:1.3,gross:10});
});

test('discount applies before tax for inclusive and exclusive prices',()=>{
  assert.deepEqual(calculateOrderTax(100,10,15),{net:90,tax:13.5,gross:103.5});
  assert.deepEqual(calculateOrderTax(100,10,15,true),{net:78.26,tax:11.74,gross:90});
  assert.deepEqual(calculateOrderTax(100,100,15),{net:0,tax:0,gross:0});
});

test('zero rate and small-value rounding are stable',()=>{
  assert.deepEqual(calculateTax(1.23,0),{net:1.23,tax:0,gross:1.23});
  assert.deepEqual(calculateTax(0.03,15),{net:0.03,tax:0,gross:0.03});
  assert.deepEqual(calculateTax(0.04,15),{net:0.04,tax:0.01,gross:0.05});
});

test('invalid amounts, rates and discounts fail closed',()=>{
  for(const amount of [-1,NaN,Infinity,-Infinity])assert.throws(()=>calculateTax(amount,15),{name:'RangeError'});
  for(const rate of [-1,101,NaN,Infinity])assert.throws(()=>calculateTax(100,rate),{name:'RangeError'});
  for(const [subtotal,discount] of [[100,101],[-1,0],[100,-1],[100,Infinity]]){
    assert.throws(()=>calculateOrderTax(subtotal,discount,15),{name:'RangeError'});
  }
});

test('minor-unit invariants hold across 1001 sample prices',()=>{
  for(let minor=0;minor<=1000;minor++){
    for(const inclusive of [true,false]){
      const amount=minor/100;
      const result=calculateTax(amount,15,inclusive);
      assert.equal(cents(result.net)+cents(result.tax),cents(result.gross));
      if(inclusive)assert.equal(cents(result.gross),minor);
      else assert.equal(cents(result.net),minor);
    }
  }
});

test('fractional VAT rates retain exact minor-unit totals for discounted orders',()=>{
  for(const rate of [2.5,7.5,20]){
    for(const inclusive of [true,false]){
      for(let subtotalMinor=0;subtotalMinor<=1000;subtotalMinor+=7){
        const discountMinor=Math.floor(subtotalMinor/3);
        const result=calculateOrderTax(subtotalMinor/100,discountMinor/100,rate,inclusive);
        assert.equal(cents(result.net)+cents(result.tax),cents(result.gross));
        assert.equal(cents(inclusive?result.gross:result.net),subtotalMinor-discountMinor);
      }
    }
  }
});
