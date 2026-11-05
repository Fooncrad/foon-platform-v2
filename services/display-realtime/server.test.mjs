import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
process.env.FOON_DISPLAY_REALTIME_SECRET="test-secret-that-is-long-enough-for-hmac";
process.env.FOON_DISPLAY_ALLOWED_ORIGINS="https://nfoodz.com";
const {verifyTicket}=await import("./server.mjs");
const ticket=(data,secret=process.env.FOON_DISPLAY_REALTIME_SECRET)=>{
 const payload=Buffer.from(JSON.stringify(data)).toString("base64url");
 return payload+"."+createHmac("sha256",secret).update(payload).digest("base64url");
};
test("relay accepts a correctly signed, short-lived screen ticket",()=>{
 const value=ticket({v:1,sub:"screen-1",tenant:"tenant-1",exp:1100,nonce:"n"});
 assert.deepEqual(verifyTicket(value,1000),{screenId:"screen-1",tenantId:"tenant-1"});
});
test("relay rejects expired, overlong, tampered and cross-version tickets",()=>{
 assert.equal(verifyTicket(ticket({v:1,sub:"s",tenant:"t",exp:999,nonce:"n"}),1000),null);
 assert.equal(verifyTicket(ticket({v:1,sub:"s",tenant:"t",exp:1201,nonce:"n"}),1000),null);
 assert.equal(verifyTicket(ticket({v:2,sub:"s",tenant:"t",exp:1100,nonce:"n"}),1000),null);
 const valid=ticket({v:1,sub:"s",tenant:"t",exp:1100,nonce:"n"});
 assert.equal(verifyTicket(valid.slice(0,-1)+"x",1000),null);
 assert.equal(verifyTicket("x".repeat(2049),1000),null);
});
