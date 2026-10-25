import test from "node:test";
import assert from "node:assert/strict";
import {validManualPaymentMethod} from "../lib/restaurant/manual-payment-method.mjs";

test("accepts the four supported manual POS payment methods shown in the UI",()=>{
 for(const value of ["cash","card","bank_transfer","other"])assert.equal(validManualPaymentMethod(value),true,value);
});

test("rejects non-string inputs that String() previously coerced into allowed methods",()=>{
 for(const value of [["cash"],["card"],["bank_transfer"],["other"],new String("cash"),{toString:()=>"cash"}]){
  assert.equal(validManualPaymentMethod(value),false,JSON.stringify(value));
 }
});

test("rejects missing, unexpected, and prototype-related payment methods",()=>{
 for(const value of [undefined,null,false,true,0,1,{},[],"","Cash"," cash","card ","bank_transfer ","paid","constructor","__proto__"]){
  assert.equal(validManualPaymentMethod(value),false,String(value));
 }
});

// The .d.mts contract must not silently omit a payment method accepted at runtime.
test("TypeScript type guard covers every accepted POS payment method",async()=>{
 const {readFile}=await import("node:fs/promises");
 const declaration=await readFile(new URL("../lib/restaurant/manual-payment-method.d.mts",import.meta.url),"utf8");
 const declared=[...declaration.matchAll(/"([^"]+)"/g)].map(match=>match[1]).sort();
 assert.deepEqual(declared,["cash","card","bank_transfer","other"].sort());
});
