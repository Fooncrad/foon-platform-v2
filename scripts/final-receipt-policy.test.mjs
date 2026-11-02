import assert from "node:assert/strict";
import {test} from "node:test";
import {finalReceiptEligible} from "../lib/restaurant/final-receipt-policy.ts";

test("final customer receipt needs BOTH completed order and confirmed paid status",()=>{
 assert.equal(finalReceiptEligible("completed","paid"),true);
 for(const status of ["new","preparing","ready","cancelled","rejected","no_show"]){
  assert.equal(finalReceiptEligible(status,"paid"),false);
 }
 for(const payment of ["unpaid","pending","refunded","failed",null]){
  assert.equal(finalReceiptEligible("completed",payment),false);
 }
});
test("receipt eligibility fails closed on malformed states",()=>{
 for(const status of [undefined,null,{},[],true,0]){
  assert.equal(finalReceiptEligible(status,"paid"),false);
 }
 assert.equal(finalReceiptEligible("COMPLETED","paid"),false);
 assert.equal(finalReceiptEligible("completed","PAID"),false);
});
