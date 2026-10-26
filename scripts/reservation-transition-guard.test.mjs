import test from 'node:test';
import assert from 'node:assert/strict';
import {reservationTransitionAllowed} from '../lib/restaurant/reservation-policy.ts';

test('new reservations cannot be created already completed, cancelled, or no-show',()=>{
 for(const next of ['completed','cancelled','no_show'])
  assert.equal(reservationTransitionAllowed(null,next),false,next);
});
test('new reservations still allow pending, confirmed, or directly seated legacy flow',()=>{
 for(const next of ['pending','confirmed','seated'])
  assert.equal(reservationTransitionAllowed(null,next),true,next);
});
test('unknown stored or requested statuses fail closed',()=>{
 for(const previous of ['unexpected','', 'paid'])
  for(const next of ['pending','confirmed','completed','no_show'])
   assert.equal(reservationTransitionAllowed(previous,next),false,`${previous}->${next}`);
 for(const next of ['unexpected','', 'paid'])
  assert.equal(reservationTransitionAllowed('confirmed',next),false,next);
});
test('confirmed no-show and terminal idempotence remain intact',()=>{
 assert.equal(reservationTransitionAllowed('confirmed','no_show'),true);
 for(const terminal of ['completed','cancelled']){
  assert.equal(reservationTransitionAllowed(terminal,terminal),true);
  assert.equal(reservationTransitionAllowed(terminal,'confirmed'),false);
 }
 assert.equal(reservationTransitionAllowed('no_show','no_show'),false);
});
test('existing nonterminal updates are unchanged',()=>{
 for(const [previous,next] of [['pending','confirmed'],['confirmed','seated'],['seated','completed'],['pending','cancelled'],['seated','cancelled']])
  assert.equal(reservationTransitionAllowed(previous,next),true,`${previous}->${next}`);
});
