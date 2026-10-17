import test from "node:test";
import assert from "node:assert/strict";
import {reservationTransitionAllowed,reservationNoShowDue} from "../lib/restaurant/reservation-policy.ts";
import {notificationCopy} from "./customer-notification-copy.mjs";

test("no-show applies only to confirmed reservations",()=>{
 assert.equal(reservationTransitionAllowed("confirmed","no_show"),true);
 for(const status of [null,"pending","seated","completed","cancelled","no_show"])
  assert.equal(reservationTransitionAllowed(status,"no_show"),false);
});
test("no-show is terminal and cannot be reopened",()=>{
 for(const next of ["pending","confirmed","seated","completed","cancelled"])
  assert.equal(reservationTransitionAllowed("no_show",next),false);
});
test("no-show requires the configured reservation period to expire",()=>{
 const now=Date.parse("2026-10-17T15:00:00.000Z");
 assert.equal(reservationNoShowDue("2026-10-17T13:30:00.000Z",90,now),true);
 assert.equal(reservationNoShowDue("2026-10-17T13:31:00.000Z",90,now),false);
 assert.equal(reservationNoShowDue("invalid",90,now),false);
 assert.equal(reservationNoShowDue("2026-10-17T13:00:00.000Z",10,now),false);
});
test("all three languages explicitly translate a no-show notification",()=>{
 for(const [locale,expected] of [["ar","لم يحضر الضيف"],["en","Guest did not attend"],["fr","Le client ne s’est pas présenté"]]){
  const copy=notificationCopy(locale,"reservation_no_show",{store:"FOON",reference:"42",status:"no_show"});
  assert.ok(copy.text.includes(expected),locale);
 }
});
