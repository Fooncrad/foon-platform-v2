import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("customer booking form separates classic reservation from unimplemented paid floor plan",()=>{
const s=read("app/[slug]/menu-services.tsx");for(const part of ['foonReservationMethod','value="classic"','value="floor" disabled','حجز عادي — بدون اختيار طاولة','حجز جلسة من المخطط — حجز أولًا ثم دفع','bookingMode:action==="reservation"?"classic":null'])assert.ok(s.includes(part),part);
});
test("server blocks client-selected tables and floor requests without atomic hold/payment",()=>{
const api=read("app/api/customer/services/route.ts");
for(const part of ['CLASSIC_TABLE_SELECTION_FORBIDDEN','PAYMENT_SETTLEMENT_INTEGRATION_REQUIRED','bookingMode:"classic",tableId:null','status:\'pending\''])assert.ok(api.includes(part),part);
assert.match(api,/body\.bookingMode!==undefined&&body\.bookingMode!=="classic"/);
});
test("calendar uses localized time labels while keeping English Gregorian digits",()=>{
const s=read("app/[slug]/booking-calendar.tsx");assert.match(s,/lang="en-US"/);assert.match(s,/fontVariantNumeric:"tabular-nums"/);assert.match(s,/hourLabel/);assert.match(s,/minuteLabel/);
});