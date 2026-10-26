import test from "node:test";
import assert from "node:assert/strict";
import {reservationTransitionAllowed} from "../lib/restaurant/reservation-policy.ts";

test("new reservations cannot begin in terminal states",()=>{
 for(const status of ["completed","cancelled","no_show"])
  assert.equal(reservationTransitionAllowed(null,status),false,status);
 for(const status of ["pending","confirmed","seated"])
  assert.equal(reservationTransitionAllowed(null,status),true,status);
});
test("unknown existing or requested statuses fail closed",()=>{
 for(const previous of ["unexpected","","paid"])
  for(const next of ["pending","confirmed","completed","no_show"])
   assert.equal(reservationTransitionAllowed(previous,next),false,previous+" -> "+next);
 for(const next of ["unexpected","","paid"])
  assert.equal(reservationTransitionAllowed("confirmed",next),false,next);
});
test("valid existing transitions remain available",()=>{
 for(const [from,to] of [["pending","confirmed"],["confirmed","seated"],["seated","completed"],["pending","cancelled"],["confirmed","no_show"]])
  assert.equal(reservationTransitionAllowed(from,to),true,from+" -> "+to);
 assert.equal(reservationTransitionAllowed("completed","completed"),true);
 assert.equal(reservationTransitionAllowed("no_show","no_show"),false);
});
