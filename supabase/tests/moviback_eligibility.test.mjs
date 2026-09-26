import assert from "node:assert/strict";
import test from "node:test";

// The production helper is TypeScript; these contract cases are mirrored by the
// route tests/build and document the frozen boundary values for SQL/HTTP fixtures.
function state(expiry, today = "2026-09-26") {
  const day = (value) => Date.UTC(...value.split("-").map((part, index) => Number(part) - (index === 1 ? 1 : 0)));
  const expiredDays = Math.floor((day(today) - day(expiry)) / 86400000);
  return expiredDays <= 0 ? "active" : expiredDays <= 60 ? "grace_period" : "standby";
}

test("expiry day is valid", () => assert.equal(state("2026-09-26"), "active"));
test("days 1 through 60 are grace", () => {
  assert.equal(state("2026-09-25"), "grace_period");
  assert.equal(state("2026-07-28"), "grace_period");
});
test("day 61 is standby", () => assert.equal(state("2026-07-27"), "standby"));
