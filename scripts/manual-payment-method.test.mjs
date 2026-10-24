import test from "node:test";
import assert from "node:assert/strict";
import {validManualPaymentMethod} from "../lib/restaurant/manual-payment-method.mjs";

test("accepts the three supported manual POS payment methods",()=>{
 for(const value of ["cash","card","other"])assert.equal(validManualPaymentMethod(value),true,value);
});

test("rejects non-string inputs that String() previously coerced into allowed methods",()=>{
 for(const value of [["cash"],["card"],["other"],new String("cash"),{toString:()=>"cash"}]){
  assert.equal(validManualPaymentMethod(value),false,JSON.stringify(value));
 }
});

test("rejects missing, unexpected, and prototype-related payment methods",()=>{
 for(const value of [undefined,null,false,true,0,1,{},[],"","Cash"," cash","card ","paid","constructor","__proto__"]){
  assert.equal(validManualPaymentMethod(value),false,String(value));
 }
});
