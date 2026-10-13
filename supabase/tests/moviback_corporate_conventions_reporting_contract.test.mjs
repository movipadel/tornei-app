import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../migrations/20261027100000_moviback_corporate_conventions_reporting.sql", import.meta.url), "utf8");
const reportRoute = readFileSync(new URL("../../src/app/api/admin/moviback/agreements/[id]/report/route.ts", import.meta.url), "utf8");
const detail = readFileSync(new URL("../../src/app/admin/moviback/agreements/[id]/page.tsx", import.meta.url), "utf8");
const meRoute = readFileSync(new URL("../../src/app/api/moviback/me/route.ts", import.meta.url), "utf8");

test("C6 reporting is derived and service-role only", () => {
  assert.match(migration, /get_moviback_agreement_report/);
  assert.doesNotMatch(migration, /ADD COLUMN\s+(code_count|bonus_total|earn_count)/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_moviback_agreement_report\(uuid\) FROM PUBLIC,anon,authenticated/);
  assert.match(reportRoute, /requireOperatorPermission\("moviback\.manage"\)/);
});

test("bonus attribution uses structured agreement-winning fields", () => {
  assert.match(migration, /credited_points-t\.base_points/);
  assert.match(migration, /incentive_source='agreement'/);
  assert.doesNotMatch(migration, /credited_points\s*-\s*(t\.)?euro_amount/);
  assert.doesNotMatch(migration, /notes\s+(LIKE|ILIKE)/i);
});

test("report never selects plaintext or code hashes", () => {
  const reportFunction = migration.slice(migration.indexOf("CREATE FUNCTION public.get_moviback_agreement_report"), migration.indexOf("CREATE FUNCTION public.get_moviback_membership_agreement_history"));
  assert.doesNotMatch(reportFunction, /code_hash/);
  assert.doesNotMatch(reportFunction, /plaintext/);
  assert.match(reportFunction, /code_suffix/);
});

test("merge preview fingerprints convention entities and blocks current conflicts", () => {
  assert.match(migration, /'entitlements'.*moviback_agreement_entitlements/s);
  assert.match(migration, /'claimed_codes'.*moviback_agreement_codes/s);
  assert.match(migration, /agreement_active_or_scheduled_conflict/);
  assert.match(migration, /agreement_current_entitlement_conflict/);
  assert.match(migration, /ledger_agreement_refs_valid/);
});

test("Admin detail renders KPI, batch, member history and traceability sections", () => {
  for (const copy of ["Utilizzo codici", "Storico membership", "Accrediti attribuiti alla convenzione", "Bonus convenzione"]) {
    assert.match(detail, new RegExp(copy));
  }
  assert.match(detail, /tableWrap/);
  assert.match(detail, /source_event_type/);
});

test("Customer Hub exposes concise membership convention history", () => {
  assert.match(meRoute, /get_moviback_membership_agreement_history/);
  assert.match(meRoute, /agreement_history/);
});
