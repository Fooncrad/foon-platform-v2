import test from "node:test";
import assert from "node:assert/strict";
import {reservationNoShowDue,reservationTransitionAllowed} from "../lib/restaurant/reservation-policy.ts";

test("no-show is only reachable from a confirmed reservation and cannot be reopened",()=>{
 assert.equal(reservationTransitionAllowed(null,"no_show"),false);
 assert.equal(reservationTransitionAllowed("pending","no_show"),false);
 assert.equal(reservationTransitionAllowed("confirmed","no_show"),true);
 assert.equal(reservationTransitionAllowed("seated","no_show"),false);
 assert.equal(reservationTransitionAllowed("no_show","confirmed"),false);
 assert.equal(reservationTransitionAllowed("completed","no_show"),false);
});

test("no-show requires the saved reservation window to have elapsed",()=>{
 const start=Date.parse("2026-10-16T10:00:00.000Z"),scheduled="2026-10-16T10:00:00.000Z";
 assert.equal(reservationNoShowDue(scheduled,60,start+3599999),false);
 assert.equal(reservationNoShowDue(scheduled,60,start+3600000),true);
 assert.equal(reservationNoShowDue(scheduled,null,start+90*60000),true);
 for(const duration of [0,29,241,1.5,"invalid"])assert.equal(reservationNoShowDue(scheduled,duration,start+86400000),false);
 assert.equal(reservationNoShowDue("not-a-date",60,start+86400000),false);
});