import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {encryptMediaToken,decryptMediaToken} from "../lib/platform/media-token-crypto.ts";

test("media tokens encrypt with randomized authenticated AES-GCM envelopes",()=>{
 const old=process.env.FOON_MEDIA_TOKEN_ENCRYPTION_KEY;
 try {
  process.env.FOON_MEDIA_TOKEN_ENCRYPTION_KEY=randomBytes(32).toString("hex");
  const first=encryptMediaToken("refresh_secret_123","tenant1","instagram","acct1");
  const second=encryptMediaToken("refresh_secret_123","tenant1","instagram","acct1");
  assert.notEqual(first,second);
  assert.equal(first.includes("refresh_secret_123"),false);
  assert.equal(decryptMediaToken(first,"tenant1","instagram","acct1"),"refresh_secret_123");
  for(const context of [["tenant2","instagram","acct1"],["tenant1","facebook","acct1"],["tenant1","instagram","acct2"]]){
   assert.throws(()=>decryptMediaToken(first,...context));
  }
  const pieces=first.split(".");
  pieces[3]=Buffer.from("tampered").toString("base64url");
  assert.throws(()=>decryptMediaToken(pieces.join("."),"tenant1","instagram","acct1"));
 } finally {
  if(old===undefined)delete process.env.FOON_MEDIA_TOKEN_ENCRYPTION_KEY;
  else process.env.FOON_MEDIA_TOKEN_ENCRYPTION_KEY=old;
 }
});
test("media token encryption fails closed without a configured key",()=>{
 const old=process.env.FOON_MEDIA_TOKEN_ENCRYPTION_KEY;
 try{
  delete process.env.FOON_MEDIA_TOKEN_ENCRYPTION_KEY;
  assert.throws(()=>encryptMediaToken("secret","tenant1","instagram","acct1"),/MEDIA_TOKEN_ENCRYPTION_KEY_MISSING/);
 } finally {
  if(old!==undefined)process.env.FOON_MEDIA_TOKEN_ENCRYPTION_KEY=old;
 }
});
