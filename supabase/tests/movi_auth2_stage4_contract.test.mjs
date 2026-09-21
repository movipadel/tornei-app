import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../migrations/20260929100000_movi_auth2_stage4_review_ops.sql");
const queue = read("../../src/app/api/admin/users/duplicates/route.ts");
const preview = read("../../src/app/api/admin/users/duplicates/preview/route.ts");
const execute = read("../../src/app/api/admin/users/duplicates/execute/route.ts");
const report = read("../../src/app/api/admin/users/duplicates/report/route.ts");
const ui = read("../../src/app/admin/users/duplicates/page.tsx");

test("scan runs are deterministic, stale-aware, idempotent, and decision preserving", () => {
  assert.match(migration, /CREATE TABLE public\.user_duplicate_scan_runs/);
  assert.match(migration, /user_duplicate_candidate_fingerprint/);
  assert.match(migration, /v_old IS NOT NULL AND v_old IS DISTINCT FROM v_new/);
  assert.match(migration, /state IN\('merged','rejected','conflict','approved'\)/);
  assert.match(migration, /refresh_user_duplicate_candidates\(p_actor_staff_id\)/);
});

test("recommendations are explained and Auth controls canonical selection", () => {
  assert.match(migration, /già collegato a Auth/);
  assert.match(migration, /possiede una membership MoviBack/);
  assert.match(migration, /ha %s registrazioni torneo/);
  assert.match(migration, /MOVI_AUTH_LINKED_PROFILE_MUST_BE_CANONICAL/);
  assert.match(ui, /Profilo suggerito come canonico perché/);
});

test("manual signals and shared or technical identities stay conservative", () => {
  assert.match(migration, /signal_type='manual'/);
  assert.match(migration, /manual_identity_review/);
  assert.match(migration, /'info','admin','segreteria','booking'/);
  assert.match(migration, /normalize_user_mobile_e164\(u\.phone\) IS NULL/);
});

test("dual MoviBack reconciliation is ledger-based and preserves evidence", () => {
  assert.match(migration, /coalesce\(sum\(points_delta\),0\)/g);
  assert.match(migration, /ledger_redemption_mismatch/);
  assert.match(migration, /UPDATE public\.loyalty_transactions SET membership_id=cm\.id/);
  assert.match(migration, /UPDATE public\.reward_redemptions SET membership_id=cm\.id/);
  assert.match(migration, /user_moviback_reconciliation_evidence/);
  assert.match(migration, /after_balance<>before_balance/);
});

test("review decisions and execution require explicit guarded workflow", () => {
  for (const route of [queue, preview, execute, report]) assert.match(route, /guardAdmin\(\)/);
  assert.match(execute, /confirmation !== "MERGE"/);
  assert.match(execute, /preview_reviewed_user_merge/);
  assert.match(execute, /execute_reviewed_user_merge/);
  assert.match(migration, /user_duplicate_review_decisions_immutable/);
  assert.match(migration, /MOVI_AUTH_REVIEW_SOURCE_CHANGED/);
  assert.match(migration, /distinct_active_league_roles/);
  for (const history of ["lineups_submitted", "results_submitted", "contests_opened", "league_audit_events"]) assert.match(queue, new RegExp(history));
});

test("post-merge verification covers identity, domains, consent, journal, and notifications", () => {
  for (const check of ["source_merged", "alias_active", "canonical_active", "ownership_moved", "roster_valid", "moviback_balance_preserved", "store_count_preserved", "tournament_history_preserved", "communications_not_emitted", "consent_not_escalated", "journal_complete"]) {
    assert.match(migration, new RegExp(`'${check}'`));
  }
  assert.match(migration, /status='needs_review'/);
});

test("dry-run export is read-only and excludes secret fields", () => {
  assert.match(migration, /Read-only Stage 4 production-precheck format/);
  assert.doesNotMatch(report, /password|auth_user_id|access_token|refresh_token/i);
  assert.match(report, /read_only: true/);
  assert.match(report, /text\/csv/);
});

test("admin UX provides filters, summary, reconciliation and verified merge result", () => {
  for (const text of ["Pending review", "High confidence", "Manual only", "Conflict", "Approved", "Merged", "Rejected", "Riconciliazione MoviBack", "Digita MERGE", "Verifica post-merge"]) assert.match(ui, new RegExp(text));
  assert.match(ui, /completion_percent/);
  assert.match(ui, /fieldWinners/);
  assert.match(ui, /format=csv/);
});

test("Stage 4 introduces no automatic merge trigger or production call", () => {
  assert.doesNotMatch(migration, /CREATE TRIGGER[^;]*execute_reviewed_user_merge/is);
  assert.doesNotMatch(queue + preview + report, /execute_reviewed_user_merge/);
  assert.doesNotMatch(migration, /DELETE FROM public\.users/i);
});
