import assert from "node:assert/strict";
import {test} from "node:test";
import {canRoleTransitionOrder,waiterCanSeeOrderChannel} from "../lib/restaurant/order-role-channel-policy.ts";

test("waiters can finish table and room service, never delivery, pickup or takeaway",()=>{
 for(const channel of ["dine_in","room_service"]){
  assert.equal(waiterCanSeeOrderChannel(channel),true);
  assert.equal(canRoleTransitionOrder("waiter",channel,"ready","completed"),true);
 }
 for(const channel of ["delivery","pickup","takeaway","hotel_service","reservation"]){
  assert.equal(waiterCanSeeOrderChannel(channel),false);
  assert.equal(canRoleTransitionOrder("waiter",channel,"ready","completed"),false);
 }
 assert.equal(canRoleTransitionOrder("waiter","dine_in","new","preparing"),false);
});
test("drivers only complete ready delivery; kitchen cannot complete orders",()=>{
 assert.equal(canRoleTransitionOrder("driver","delivery","ready","completed"),true);
 assert.equal(canRoleTransitionOrder("driver","dine_in","ready","completed"),false);
 assert.equal(canRoleTransitionOrder("driver","takeaway","ready","completed"),false);
 assert.equal(canRoleTransitionOrder("driver","delivery","new","preparing"),false);
 assert.equal(canRoleTransitionOrder("kitchen","dine_in","new","preparing"),true);
 assert.equal(canRoleTransitionOrder("kitchen","delivery","preparing","ready"),true);
 assert.equal(canRoleTransitionOrder("kitchen","delivery","ready","completed"),false);
});
test("managers/cashiers keep allowed transitions; accountant and customers gain none",()=>{
 for(const role of ["owner","manager","cashier"])assert.equal(canRoleTransitionOrder(role,"delivery","ready","completed"),true);
 for(const role of ["accountant","customer","super_admin",""])assert.equal(canRoleTransitionOrder(role,"dine_in","ready","completed"),false);
 assert.equal(canRoleTransitionOrder("owner","dine_in","completed",undefined),false);
});
