import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../migrations/20261023100000_moviback_corporate_conventions_foundation.sql");
const creditTimeHotfix = read("../migrations/20261029100000_moviback_credit_post_lock_event_time.sql");
const route = read("../../src/app/api/staff/earn-points/route.ts");
const staffUi = read("../../src/app/staff/StaffOperations.tsx");

test("C1 creates the reusable agreement, hash-only code, entitlement and append-only audit model", () => {
  for (const table of [
    "moviback_agreements",
    "moviback_agreement_codes",
    "moviback_agreement_entitlements",
    "moviback_agreement_audit_events",
  ]) assert.match(migration, new RegExp(`CREATE TABLE public\\.${table}`));
  assert.doesNotMatch(migration, /\bplaintext_code\b|\bcode text\b/i);
  assert.match(migration, /code_hash text NOT NULL UNIQUE/);
  assert.match(migration, /moviback_entitlements_one_active_per_membership/);
  assert.match(migration, /MOVIBACK_AGREEMENT_AUDIT_APPEND_ONLY/);
});

test("structured commercial ledger remains additive and balance remains the ledger sum", () => {
  assert.match(migration, /ADD COLUMN base_points integer/);
  assert.match(migration, /ADD COLUMN applied_multiplier numeric/);
  assert.match(migration, /ADD COLUMN credited_points integer/);
  assert.match(migration, /earning_rule_version IS DISTINCT FROM 'moviback-credit-v1'/);
  assert.match(migration, /points_delta = credited_points/);
  assert.match(migration, /SELECT coalesce\(sum\(points_delta\),0\) INTO v_balance/);
  assert.doesNotMatch(migration, /UPDATE public\.loyalty_transactions SET (?:base_points|applied_multiplier|credited_points)/);
});

test("C2 owns locking, DB time, promo/agreement max selection and the only structured earn insert", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.credit_moviback_points/);
  assert.match(migration, /WHERE membership_code = btrim\(p_membership_code\)[\s\S]*FOR UPDATE/);
  assert.match(creditTimeHotfix, /FOR UPDATE;[\s\S]*v_event_at := clock_timestamp\(\)/);
  assert.doesNotMatch(creditTimeHotfix, /v_event_at := transaction_timestamp\(\)/);
  assert.match(migration, /v_effective_multiplier := greatest\(1,v_promo_multiplier,v_agreement_multiplier\)/);
  assert.match(migration, /applicable promo wins ties/);
  assert.match(migration, /'earn','club_payment'/);
  assert.match(migration, /'moviback-credit-v1'/);
  assert.match(migration, /v_event_at < e\.effective_until/);
  assert.match(migration, /v_event_at < e\.revoked_at/);
});

test("idempotency is membership-owner scoped and concurrent requests return the committed result", () => {
  assert.match(migration, /'moviback_credit'::text/);
  assert.match(migration, /ON CONFLICT \(operation,user_id,idempotency_key\) DO NOTHING/);
  assert.match(migration, /RETURN v_existing_result \|\| jsonb_build_object\('created',false,'replayed',true\)/);
  assert.match(migration, /loyalty_transactions_moviback_credit_idempotency_unique/);
});

test("the staff route is a thin authorized RPC adapter and the UI reuses its request key on retry", () => {
  assert.match(route, /requireOperatorPermission\("scanner\.manage"\)/);
  assert.match(route, /\.rpc\("credit_moviback_points"/);
  assert.match(route, /p_source_event_type: "staff_scan"/);
  assert.doesNotMatch(route, /loyalty_user_promos|loyalty_global_promos|\.from\("loyalty_transactions"\)|Math\.floor/);
  assert.match(staffUi, /crypto\.randomUUID\(\)/);
  assert.match(staffUi, /pendingCredit\.current\.key/);
  assert.match(staffUi, /idempotency_key:/);
});

test("incentive resolution is isolated from debit, refund, adjustment and fee paths", () => {
  const rpcBody = migration.match(/CREATE OR REPLACE FUNCTION public\.credit_moviback_points[\s\S]*?\n\$function\$;/)?.[0] ?? "";
  assert.match(rpcBody, /'earn','club_payment'/);
  assert.doesNotMatch(rpcBody, /manual_adjustment|membership_fee|store_order|cancellation/);
  assert.equal((migration.match(/credit_moviback_points\(/g) ?? []).length >= 3, true);
});

test("merge reconciliation moves codes and entitlements or rolls back to needs_review on overlap", () => {
  assert.match(migration, /MOVI_AUTH_MOVIBACK_ENTITLEMENT_CONFLICT/);
  assert.match(migration, /UPDATE public\.moviback_agreement_codes SET claimed_by_membership_id=cm\.id/);
  assert.match(migration, /UPDATE public\.moviback_agreement_entitlements SET membership_id=cm\.id/);
  assert.match(migration, /'membership_reconciled'/);
  assert.match(migration, /status='needs_review'/);
});

test("RLS and grants keep agreement mutation and credit execution server-only", () => {
  assert.match(migration, /ALTER TABLE public\.moviback_agreements ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE[\s\S]*FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.credit_moviback_points[\s\S]*FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.credit_moviback_points[\s\S]*TO service_role/);
});
