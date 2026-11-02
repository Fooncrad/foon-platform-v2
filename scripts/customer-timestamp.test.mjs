import test from "node:test";
import assert from "node:assert/strict";
import {safeCustomerIsoDate} from "../lib/ux/customer-timestamp.mjs";

test("valid database Date and ISO values preserve the timestamp", () => {
  const iso = "2026-10-25T01:00:00.000Z";
  assert.equal(safeCustomerIsoDate(new Date(iso)), iso);
  assert.equal(safeCustomerIsoDate(iso), iso);
});

test("invalid, missing and malformed dates fail closed without throwing", () => {
  for (const value of [null, undefined, "", "not-a-date", "2026-99-99", new Date(NaN), {}, [], true, NaN, Infinity]) {
    assert.doesNotThrow(() => safeCustomerIsoDate(value));
    assert.equal(safeCustomerIsoDate(value), null);
  }
});

test("zero epoch is a valid explicit numeric timestamp", () => {
  assert.equal(safeCustomerIsoDate(0), "1970-01-01T00:00:00.000Z");
});

test("invalid timestamp previously crashed toISOString before filtering", () => {
  assert.throws(() => new Date("not-a-date").toISOString(), RangeError);
  const events = [{at:safeCustomerIsoDate("not-a-date")??""},{at:safeCustomerIsoDate("2026-10-25T01:00:00Z")??""}];
  assert.equal(events.filter(entry => entry.at !== "").length, 1);
});
