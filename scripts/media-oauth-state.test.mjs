import test from "node:test";
import assert from "node:assert/strict";
import {
 createMediaOAuthState,hashMediaOAuthState,constantTimeMediaStateMatch,
 isMediaOAuthStateUsable,mediaOAuthRedirectPath,MEDIA_OAUTH_STATE_TTL_SECONDS
} from "../lib/platform/media-oauth-state.ts";

test("OAuth state uses unique 256-bit opaque values and stores hashes",()=>{
 const a=createMediaOAuthState(),b=createMediaOAuthState();
 assert.equal(a.state.length,43);
 assert.notEqual(a.state,b.state);
 assert.match(a.stateHash,/^[a-f0-9]{64}$/);
 assert.equal(hashMediaOAuthState(a.state),a.stateHash);
 assert.notEqual(a.state,a.stateHash);
 assert.equal(constantTimeMediaStateMatch(a.state,a.stateHash),true);
 assert.equal(constantTimeMediaStateMatch(b.state,a.stateHash),false);
 assert.equal(constantTimeMediaStateMatch("bad",a.stateHash),false);
 assert.equal(MEDIA_OAUTH_STATE_TTL_SECONDS,600);
});
test("OAuth state is tenant/user/provider-bound, expiring and single-use",()=>{
 const {state,stateHash}=createMediaOAuthState();
 const now=new Date("2026-10-14T12:00:00Z");
 const row={tenant_id:"tenant1",user_id:"user1",provider:"instagram",state_hash:stateHash,expires_at:"2026-10-14T12:05:00Z",consumed_at:null};
 const context={tenantId:"tenant1",userId:"user1",provider:"instagram",state};
 assert.equal(isMediaOAuthStateUsable(row,context,now),true);
 assert.equal(isMediaOAuthStateUsable({...row,consumed_at:now},context,now),false);
 assert.equal(isMediaOAuthStateUsable(row,{...context,tenantId:"tenant2"},now),false);
 assert.equal(isMediaOAuthStateUsable(row,{...context,userId:"user2"},now),false);
 assert.equal(isMediaOAuthStateUsable(row,{...context,provider:"facebook"},now),false);
 assert.equal(isMediaOAuthStateUsable(row,context,new Date("2026-10-14T12:05:00Z")),false);
});
test("OAuth redirects cannot be external URLs",()=>{
 assert.equal(mediaOAuthRedirectPath("tenant_1"),"/restaurant/media-studio?tenant=tenant_1");
 for(const bad of ["https://evil.example","../other","a?next=evil",""])assert.throws(()=>mediaOAuthRedirectPath(bad));
});
