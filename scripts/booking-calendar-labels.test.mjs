import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("booking calendar uses translated labels while keeping Gregorian Latin digits",()=>{
 const ui=readFileSync(new URL("../app/[slug]/booking-calendar.tsx",import.meta.url),"utf8");
 for(const value of ['"الساعة"','"الدقيقة"','"Heure"','"Minute"','lang="en-US"','aria-label={hourLabel}','aria-label={minuteLabel}','fontVariantNumeric:"tabular-nums"'])
  assert.ok(ui.includes(value),value);
});
