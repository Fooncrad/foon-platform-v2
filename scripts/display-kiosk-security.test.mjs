import test from "node:test";
import assert from "node:assert/strict";
import {createKioskPinRecord,verifyKioskPin,createKioskSession,verifyKioskSession} from "../lib/display/kiosk-security.ts";

test("Kiosk PIN is salted and verified without storing the clear PIN",()=>{
 const record=createKioskPinRecord("4826");
 assert.notEqual(record.hash,"4826");
 assert.equal(record.salt.length,32);
 assert.equal(record.hash.length,128);
 assert.equal(verifyKioskPin("4826",record.salt,record.hash),true);
 assert.equal(verifyKioskPin("4827",record.salt,record.hash),false);
 assert.throws(()=>createKioskPinRecord("123"));
});

test("Kiosk sessions are signed, token-bound and expire after twelve hours",()=>{
 const record=createKioskPinRecord("915204");
 const now=1_800_000_000_000;
 const session=createKioskSession("display-token",record.hash,now);
 assert.equal(verifyKioskSession("display-token",record.hash,session.value,now+1000),true);
 assert.equal(verifyKioskSession("another-token",record.hash,session.value,now+1000),false);
 assert.equal(verifyKioskSession("display-token",record.hash,session.value+"x",now+1000),false);
 assert.equal(verifyKioskSession("display-token",record.hash,session.value,now+13*60*60*1000),false);
});
