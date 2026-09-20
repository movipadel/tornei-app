import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260921090000_monday_league_stage6_results_contests.sql", "utf8");
const publicModel = readFileSync("src/lib/monday-league/public-read-model.ts", "utf8");
const captainUi = readFileSync("src/components/monday-league/PublicLeagueViews.tsx", "utf8");
const resultRoute = readFileSync("src/app/api/monday-league/matches/[matchId]/result/route.ts", "utf8");
const contestRoute = readFileSync("src/app/api/monday-league/matches/[matchId]/contest/route.ts", "utf8");
const adminRoute = readFileSync("src/app/api/admin/monday-league/results/route.ts", "utf8");
const adminUi = readFileSync("src/app/admin/monday-league/risultati/page.tsx", "utf8");

test("captain routes derive the actor only from the signed session cookie", () => {
  for (const source of [resultRoute, contestRoute]) {
    assert.match(source, /getUserIdFromCookie\(\)/);
    assert.doesNotMatch(source, /body\.(user_id|team_id)/);
  }
  assert.match(resultRoute, /league_captain_submit_result/);
  assert.match(contestRoute, /league_away_captain_contest_result/);
});

test("database owns home/away authorization, start time and exact contest deadline", () => {
  assert.match(migration, /league_is_captain\(p_actor_user_id,v_match\.home_team_id\)/);
  assert.match(migration, /now\(\) < v_match\.scheduled_at/);
  assert.match(migration, /league_is_captain\(p_actor_user_id,v_match\.away_team_id\)/);
  assert.match(migration, /now\(\) >= v_result\.submitted_at \+ interval '48 hours'/);
});

test("captain score uses Stage 3 validation and is immutable", () => {
  assert.match(migration, /league_validate_match_sets\(p_sets\)/);
  assert.match(migration, /ML_RESULT_ALREADY_EXISTS/);
  assert.match(migration, /submitter_type.*'captain'/s);
  assert.match(captainUi, /Dopo l'invio non potrai modificarlo/);
});

test("contest storage is revision-linked, bounded and unique while open", () => {
  assert.match(migration, /CREATE TABLE public\.league_result_contests/);
  assert.match(migration, /result_submission_id uuid NOT NULL/);
  assert.match(migration, /char_length\(btrim\(reason\)\) <= 1000/);
  assert.match(migration, /league_result_contests_one_open_result_key/);
});

test("effective finalization does not depend on a scheduler", () => {
  assert.match(migration, /league_effective_result_status/);
  assert.match(migration, /now\(\) >= r\.submitted_at \+ interval '48 hours'/);
  assert.match(publicModel, /league_get_result_states/);
  assert.match(migration, /league_get_standings[\s\S]*league_effective_result_status/);
});

test("admin resolution and correction preserve immutable revisions", () => {
  assert.match(migration, /league_admin_resolve_contest/);
  assert.match(migration, /status='superseded'/);
  assert.match(migration, /v_revision:=v_old\.revision\+1/);
  assert.match(migration, /status='confirmed',confirmed_at=now\(\)/);
  assert.match(adminRoute, /resolve_contest/);
});

test("public output exposes effective labels but no private reasons", () => {
  assert.match(publicModel, /Provvisorio/);
  assert.match(publicModel, /Contestato/);
  assert.match(publicModel, /Definitivo/);
  assert.doesNotMatch(publicModel, /resolution_note|correction_reason|league_result_contests/);
});

test("captain and admin UX expose the required controls and filters", () => {
  for (const label of ["Inserisci risultato", "Risultato inviato", "Non modificabile", "Contesta risultato", "Contestazione inviata", "Termine contestazione scaduto"]) assert.ok(captainUi.includes(label));
  for (const label of ["DA INSERIRE", "PROVVISORI", "CONTESTATI", "DEFINITIVI", "SPECIALI", "Respingi contestazione", "Accogli e correggi"]) assert.ok(adminUi.includes(label));
});

test("resulted matches reject ordinary rescheduling and database APIs stay service-only", () => {
  assert.match(migration, /ML_RESULTED_MATCH_RESCHEDULE_FORBIDDEN/);
  assert.match(migration, /REVOKE ALL ON public\.league_result_contests FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE[\s\S]*TO service_role/);
});
