import test from 'node:test';
import assert from 'node:assert/strict';
import {googleLinkEligibility} from '../lib/auth/google-link-policy.mjs';

test('verified active local account can link',()=>{
 assert.equal(googleLinkEligibility({status:'active',email_verified_at:new Date('2026-10-21')}),'allowed');
});
test('unverified active local account cannot be silently claimed',()=>{
 for(const value of [null,undefined,'',0])assert.equal(googleLinkEligibility({status:'active',email_verified_at:value}),'unverified');
});
test('disabled, missing or incomplete user cannot link',()=>{
 for(const user of [null,undefined,{}, {status:'disabled',email_verified_at:new Date()}, {status:'pending',email_verified_at:new Date()}])assert.equal(googleLinkEligibility(user),'disabled');
});
