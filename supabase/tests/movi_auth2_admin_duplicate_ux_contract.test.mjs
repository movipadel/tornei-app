import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("../../src/app/admin/users/duplicates/page.tsx");
const workflow = read("../../src/lib/adminDuplicateWorkflow.ts");
const preview = read("../../src/app/api/admin/users/duplicates/preview/route.ts");
const resolve = read("../../src/app/api/admin/users/duplicates/resolve/route.ts");
const list = read("../../src/app/api/admin/users/duplicates/route.ts");
const stage3 = read("../migrations/20260928100000_movi_auth2_stage3_merge_engine.sql");
const stage4 = read("../migrations/20260929100000_movi_auth2_stage4_review_ops.sql");

test("normal UI is the three-step operator workflow", () => {
  assert.match(page, /Profili duplicati/);
  assert.match(page, /Scegli il profilo da mantenere/);
  assert.match(page, /Controlla il risultato/);
  assert.match(page, /Unisci tutti i profili sicuri/);
  assert.match(page, /TIENI QUESTO PROFILO/);
  assert.match(page, /UNISCI PROFILI/);
  assert.doesNotMatch(page, /Approva piano|Aggiorna preflight|Digita MERGE|Vincitore |Profilo sorgente|Usa come canonico/);
});

test("queue exposes only human status and reason labels", () => {
  for (const copy of ["DA CONTROLLARE", "PRONTO", "RICHIEDE ATTENZIONE", "RISOLTO", "Stessa email", "Stesso telefono", "Dati molto simili"]) assert.match(page, new RegExp(copy));
  assert.match(page, /Dettagli tecnici/);
});

test("browser submits a group and keep profile without pairwise machinery", () => {
  assert.match(page, /group_id: selected\.id, keep_user_id: keepId/);
  assert.doesNotMatch(page, /source_user_id|fingerprint|confirmation.*MERGE/);
  assert.match(preview, /previewDuplicateGroup/);
  assert.match(resolve, /resolveDuplicateGroup/);
});

test("server orchestrates every source sequentially with fresh certified checks", () => {
  assert.match(workflow, /for \(const sourceId of preview\.source_user_ids/);
  assert.match(workflow, /save_user_duplicate_review_decision/);
  assert.match(workflow, /preview_reviewed_user_merge/);
  assert.match(workflow, /create_reviewed_user_merge_operation/);
  assert.match(workflow, /execute_reviewed_user_merge/);
  assert.match(workflow, /activeIdsFor\(currentGroupId\)/);
  assert.match(workflow, /buildPreview\(currentGroupId/);
  assert.match(workflow, /if \(preview\.state !== "ready"\) return \{ \.\.\.preview, completed \}/);
  assert.match(workflow, /winners = \(preview\.technical/);
  assert.doesNotMatch(workflow, /silently|retry.*fingerprint/i);
});

test("stale partial groups are recovered from active aliases and a fresh scan", () => {
  assert.match(workflow, /merged_into_user_id/);
  assert.match(workflow, /run_user_duplicate_scan/);
  assert.match(workflow, /recovered_group/);
  assert.match(page, /profili già uniti sono stati esclusi automaticamente/);
});

test("operator copy maps real conflicts and hides codes", () => {
  for (const code of ["multiple_auth_identities", "same_tournament", "same_league_roster", "membership_cardinality_unsupported"]) assert.match(workflow, new RegExp(code));
  assert.match(page, /Serve una scelta prima di continuare/);
  assert.doesNotMatch(page, />\s*(?:admin_approval_required|activation_review_required|MOVI_AUTH_REVIEW_MEMBER_NOT_INCLUDED)\s*</);
});

test("activation review has an idempotent server continuation", () => {
  assert.match(workflow, /user_auth_onboarding/);
  assert.match(workflow, /resolve_and_link_verified_auth_user/);
  assert.match(page, /Nuovo accesso in attesa/);
});

test("M-02 bounded list strategy and certified safety architecture remain", () => {
  assert.match(list, /duplicate_user_reference_counts/);
  assert.match(list, /\.limit\(500\)/);
  assert.match(stage3, /INSERT INTO public\.user_merge_journal/);
  assert.doesNotMatch(stage3, /DELETE FROM public\.user_merge_journal/);
  assert.match(stage3, /same_tournament/);
  assert.match(stage3, /same_league_roster/);
  assert.match(stage4, /preview_dual_moviback_reconciliation/);
  assert.match(stage4, /'marketing_accepted',\(c\.marketing_accepted AND s\.marketing_accepted\)/);
});
