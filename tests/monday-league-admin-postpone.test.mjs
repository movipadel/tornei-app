import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canPostponeMatch } from "../src/lib/monday-league/admin-postpone.ts";

const page = readFileSync(new URL("../src/app/admin/monday-league/risultati/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/admin/monday-league/results/route.ts", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../supabase/migrations/20260924100000_monday_league_prerelease_remediation.sql", import.meta.url), "utf8");
const scheduled = { match_status: "scheduled", current_result_id: null, current_special_outcome_id: null };

test("eligible scheduled match has a visible postpone action in the missing-results list", () => {
  assert.equal(canPostponeMatch(scheduled, "phase1", "in_progress", false), true);
  assert.match(page, /filter === "missing" && canPostpone\(match\) \? <button[^>]*onClick=\{\(\) => void postponeMatch\(match\)\}>Rinvia partita<\/button>/);
});

test("postpone action is unavailable for noneligible match, season, phase or contest states", () => {
  for (const status of ["postponed", "suspended", "cancelled", "confirmed", "submitted"]) {
    assert.equal(canPostponeMatch({ ...scheduled, match_status: status }, "phase1", "in_progress", false), false, status);
  }
  assert.equal(canPostponeMatch({ ...scheduled, current_result_id: "result" }, "phase1", "in_progress", false), false);
  assert.equal(canPostponeMatch({ ...scheduled, current_special_outcome_id: "special" }, "phase1", "in_progress", false), false);
  assert.equal(canPostponeMatch(scheduled, "completed", "in_progress", false), false);
  assert.equal(canPostponeMatch(scheduled, "phase2", "finalized", false), false);
  assert.equal(canPostponeMatch(scheduled, "phase1", "in_progress", true), false);
});

test("postpone requires a reason and confirmation, then reuses the versioned workflow route", () => {
  assert.match(page, /window\.prompt\("Motivazione breve del rinvio \(obbligatoria\):"\)/);
  assert.match(page, /if \(!postponeReason\) return toast\.error\("Motivazione obbligatoria"\)/);
  assert.match(page, /window\.confirm\(`Rinviare /);
  assert.match(page, /command\(\{ action: "workflow", match_id: match\.id, expected_schedule_version: match\.schedule_version, state: "postponed", reason: postponeReason \}\)/);
  assert.match(page, /async function command\([\s\S]*?if \(!response\.ok\)[\s\S]*?await load\(\)/);
  assert.match(route, /action === "workflow"\) call = sb\.rpc\("league_set_match_workflow_state"/);
  assert.match(workflow, /league_assert_admin\(p_actor_id\)/);
  assert.match(workflow, /v_match\.schedule_version<>p_expected_schedule_version/);
  assert.match(workflow, /scheduled_at=CASE WHEN p_state='postponed' THEN NULL/);
  assert.match(workflow, /INSERT INTO public\.league_audit_events/);
});

test("existing result entry remains on its canonical submit/correct path", () => {
  assert.match(page, /async function saveResult\(\)[\s\S]*?action: current \? "correct" : "submit"/);
  assert.match(route, /action === "submit"\) call = sb\.rpc\("league_admin_submit_result"/);
  assert.match(route, /action === "correct"\) call = sb\.rpc\("league_admin_correct_result"/);
});
