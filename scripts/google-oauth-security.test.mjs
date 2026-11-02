import test from "node:test";
import assert from "node:assert/strict";
import {GOOGLE_OAUTH_COOKIE_PATH,validGoogleOauthState,canUseGoogleLinkedAccount} from "../lib/auth/google-oauth-security.mjs";

const state="A".repeat(43);
test("OAuth state accepts exact base64url token",()=>{
 assert.equal(validGoogleOauthState(state,state),true);
 assert.equal(validGoogleOauthState(state,"B".repeat(43)),false);
});
test("OAuth state rejects malformed and non-ASCII values",()=>{
 for(const value of [undefined,null,0,{},"","A".repeat(42),"A".repeat(44),"-".repeat(42)+"☃","A".repeat(42)+"+"]){
  assert.equal(validGoogleOauthState(value,state),false);
  assert.equal(validGoogleOauthState(state,value),false);
 }
});
test("Google link requires active email-verified account",()=>{
 assert.equal(canUseGoogleLinkedAccount({status:"active",email_verified_at:new Date()}),true);
 assert.equal(canUseGoogleLinkedAccount({status:"active",email_verified_at:"2026-10-22 00:00:00"}),true);
 for(const account of [null,undefined,{}, {status:"pending",email_verified_at:new Date()}, {status:"suspended",email_verified_at:new Date()}, {status:"active",email_verified_at:null}, {status:"active"}]){
  assert.equal(canUseGoogleLinkedAccount(account),false);
 }
});
test("OAuth cookie path covers callback route",()=>{
 assert.equal(GOOGLE_OAUTH_COOKIE_PATH,"/api/auth/google");
});
