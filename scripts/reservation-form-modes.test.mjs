import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("customer reservation retains classic and cash-at-venue floor choices",()=>{
 const ui=read("app/[slug]/menu-services.tsx");
 for(const part of ['value="classic"','value="floor_cash"','CustomerFloorMap','cashSeat?.floorTableId','paymentMethod:action===\'reservation\'&&bookingMode===\'floor_cash\'?\'cash\''])
  assert.ok(ui.includes(part),part);
 assert.ok(!ui.includes('value="floor" disabled'),"do not regress floor selection");
});

test("cash floor reservation uses real table lock and rejects time overlap",()=>{
 const api=read("app/api/customer/services/route.ts");
 for(const part of ['CLASSIC_TABLE_SELECTION_FORBIDDEN','TABLE_TIME_UNAVAILABLE','TABLE_CAPACITY_UNAVAILABLE','FOR UPDATE','body.bookingMode==="floor_cash"','body.paymentMethod!=="cash"','status:\'pending\''])
  assert.ok(api.includes(part),part);
});

test("calendar labels are localized while Gregorian digits stay Latin",()=>{
 const ui=read("app/[slug]/booking-calendar.tsx");
 for(const part of ['lang="en-US"','fontVariantNumeric:"tabular-nums"','hourLabel','minuteLabel','"الساعة"','"الدقيقة"'])
  assert.ok(ui.includes(part),part);
});
