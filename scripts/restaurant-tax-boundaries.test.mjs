import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateTax,calculateOrderTax} from '../lib/restaurant/tax-calculation.ts';
import {majorToMinor} from '../lib/payments/webhook-verification.mjs';
import {validateResource} from './restaurant-resource-schema.mjs';

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

test('VAT totals agree with payment minor units for inclusive and exclusive order previews',()=>{
 const toMinor=value=>majorToMinor(value.toFixed(2),'SAR');
 for(const [subtotal,discount] of [[0,0],[0.01,0],[0.04,0],[10,1],[100,10],[115,15],[99999.99,999.99]]){
  for(const inclusive of [false,true]){
   const {net,tax,gross}=calculateOrderTax(subtotal,discount,15,inclusive);
   const expected=toMinor(subtotal)-toMinor(discount);
   assert.equal(toMinor(net)+toMinor(tax),toMinor(gross),'invoice line tax breakdown must match checkout amount');
   assert.equal(toMinor(inclusive?gross:net),expected,'inclusive price must not be taxed twice; exclusive net must match order base');
   assert.ok(toMinor(gross)>=0,'payment amount cannot be negative');
  }
 }
});


test('rejects fractional halalas before tax or discount calculation',()=>{
 for(const value of [0.001,0.005,1.005,10.075,99.999]){
  assert.throws(()=>calculateTax(value,15),{name:'RangeError',message:'INVALID_AMOUNT_PRECISION'});
  assert.throws(()=>calculateOrderTax(value,0,15),{name:'RangeError',message:'INVALID_AMOUNT_PRECISION'});
  assert.throws(()=>calculateOrderTax(100,value,15),{name:'RangeError',message:'INVALID_AMOUNT_PRECISION'});
 }
});

test('accepts exact halalas despite binary floating point noise',()=>{
 assert.deepEqual(calculateTax(0.1+0.2,15),{net:0.3,tax:0.05,gross:0.35});
 assert.deepEqual(calculateOrderTax(0.3,0.1+0.2,15),{net:0,tax:0,gross:0});
 for(let cents=0;cents<=10000;cents++){
  const amount=cents/100;
  assert.equal(Math.round(calculateTax(amount,0).gross*100),cents);
 }
});

test('rejects unsafe integer minor amounts',()=>{
 assert.throws(()=>calculateTax(Number.MAX_SAFE_INTEGER,15),RangeError);
});

// Pure contract coverage: this does not persist an order or settle a payment.
test('discounted VAT previews survive invoice validation with the exact SAR checkout amount',()=>{
 const cases=[
  {subtotal:100,discount:10,inclusive:false,net:90,tax:13.5,gross:103.5,fee:2.25,checkout:10575},
  {subtotal:115,discount:15,inclusive:true,net:86.96,tax:13.04,gross:100,fee:0,checkout:10000},
  {subtotal:0.04,discount:0,inclusive:false,net:0.04,tax:0.01,gross:0.05,fee:0.01,checkout:6},
  {subtotal:0.3,discount:0.1+0.2,inclusive:true,net:0,tax:0,gross:0,fee:0,checkout:0}
 ];
 for(const c of cases){
  const preview=calculateOrderTax(c.subtotal,c.discount,15,c.inclusive);
  assert.deepEqual(preview,{net:c.net,tax:c.tax,gross:c.gross});
  for(const resourceModule of ['customerInvoices','internalInvoices']){
   const invoice=validateResource(resourceModule,{
    name:'VAT checkout contract',status:'draft',
    data:{invoiceNumber:'CONTRACT-ONLY',subtotal:preview.net,taxAmount:preview.tax,serviceFee:c.fee}
   }).data;
   const invoiceMinor=['subtotal','taxAmount','serviceFee']
    .reduce((sum,key)=>sum+majorToMinor(String(invoice[key]),'SAR'),0);
   assert.equal(invoiceMinor,c.checkout,`${resourceModule}: net + VAT + fee must equal checkout`);
   assert.equal(majorToMinor((invoice.subtotal+invoice.taxAmount+invoice.serviceFee).toFixed(2),'SAR'),c.checkout);
  }
 }
});
