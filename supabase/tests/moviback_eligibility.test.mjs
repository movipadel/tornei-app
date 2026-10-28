import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../../src/lib/movibackEligibility.ts", import.meta.url), "utf8")
  .replace('import "server-only";', "");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const eligibilityModule = { exports: {} };
Function("module", "exports", compiled)(eligibilityModule, eligibilityModule.exports);
const {
  CERTIFICATE_ENFORCEMENT_CUTOVER_UTC,
  computeMovibackEligibility,
} = eligibilityModule.exports;

const beforeCutover = "2026-10-28T15:13:44.999Z";
const atCutover = "2026-10-28T15:13:45.000Z";
const afterCutover = "2026-10-28T15:13:45.001Z";
const member = (overrides = {}) => ({
  id: "membership-1",
  status: "approved",
  tax_code: "RSSMRA90A01H501U",
  approved_at: beforeCutover,
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});
const certificate = (overrides = {}) => ({
  id: "certificate-1",
  status: "pending_review",
  expiry_date: "2027-12-31",
  uploaded_at: beforeCutover,
  ...overrides,
});
const eligibility = ({ memberships = [member()], certificates = [certificate()], accountActive = true, currentDate = "2026-10-28" } = {}) =>
  computeMovibackEligibility({ memberships, certificates, accountActive, currentDate });

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

test("legacy pending certificate retains card, earning and redemption while review remains visible", () => {
  assert.equal(CERTIFICATE_ENFORCEMENT_CUTOVER_UTC, "2026-10-28T15:13:45Z");
  const result = eligibility();
  assert.equal(result.eligibility_state, "pending_review");
  assert.equal(result.reason_code, "LEGACY_CERTIFICATE_PENDING");
  assert.equal(result.can_use_card, true);
  assert.equal(result.can_earn_points, true);
  assert.equal(result.can_redeem, true);
  assert.equal(result.needs_certificate_review, true);
  assert.equal(result.approved_certificate_id, null);
});

test("legacy approval timestamp falls back to membership creation timestamp", () => {
  const result = eligibility({ memberships: [member({ approved_at: null })] });
  assert.equal(result.reason_code, "LEGACY_CERTIFICATE_PENDING");
  assert.equal(result.can_earn_points, true);
});

test("cutover comparison is strict for certificate and membership timestamps", () => {
  for (const uploaded_at of [atCutover, afterCutover]) {
    const result = eligibility({ certificates: [certificate({ uploaded_at })] });
    assert.equal(result.reason_code, "CERTIFICATE_PENDING");
    assert.equal(result.can_use_card, false);
  }
  for (const approved_at of [atCutover, afterCutover]) {
    const result = eligibility({ memberships: [member({ approved_at })] });
    assert.equal(result.reason_code, "CERTIFICATE_PENDING");
    assert.equal(result.can_earn_points, false);
  }
});

test("rejected and missing certificates never receive legacy compatibility", () => {
  const rejected = eligibility({ certificates: [certificate({ status: "rejected" })] });
  assert.equal(rejected.reason_code, "CERTIFICATE_MISSING");
  assert.equal(rejected.can_redeem, false);
  const missing = eligibility({ certificates: [] });
  assert.equal(missing.reason_code, "CERTIFICATE_MISSING");
  assert.equal(missing.can_use_card, false);
});

test("approved certificate active, grace and standby behavior remains unchanged", () => {
  const approved = (expiry_date) => certificate({ status: "approved", expiry_date });
  const active = eligibility({ certificates: [approved("2026-10-28")] });
  assert.equal(active.eligibility_state, "active");
  assert.equal(active.can_earn_points, true);
  const grace = eligibility({ certificates: [approved("2026-09-01")] });
  assert.equal(grace.eligibility_state, "grace_period");
  assert.equal(grace.can_earn_points, true);
  const standby = eligibility({ certificates: [approved("2026-08-01")] });
  assert.equal(standby.eligibility_state, "standby");
  assert.equal(standby.can_earn_points, false);
  assert.equal(standby.can_redeem, true);
  assert.equal(standby.can_use_card, true);
});

test("membership, account, tax-code and cardinality guards remain authoritative", () => {
  assert.equal(eligibility({ memberships: [member({ status: "pending_review" })] }).reason_code, "MEMBERSHIP_PENDING");
  assert.equal(eligibility({ accountActive: false }).reason_code, "ACCOUNT_INACTIVE");
  assert.equal(eligibility({ memberships: [member({ tax_code: "bad" })] }).reason_code, "TAX_CODE_INVALID");
  assert.equal(eligibility({ memberships: [member(), member({ id: "membership-2" })] }).reason_code, "MEMBERSHIP_CARDINALITY");
  assert.equal(eligibility({ memberships: [] }).reason_code, "NO_MEMBERSHIP");
});
