import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260923100000_monday_league_stage9_completion.sql");
const route = read("src/app/api/admin/monday-league/completion/route.ts");
const admin = read("src/app/admin/monday-league/fase-2/page.tsx");
const publicViews = read("src/components/monday-league/PublicLeagueViews.tsx");
const publicModel = read("src/lib/monday-league/public-read-model.ts");

test("completion readiness reuses authoritative terminal semantics for both divisions", () => {
  assert.match(migration, /league_effective_result_status\(r\.id\)='confirmed'/);
  assert.match(migration, /so\.status='active' AND m\.match_status='confirmed'/);
  assert.match(migration, /code='serie_a'/);
  assert.match(migration, /code='serie_b'/);
  for (const label of ["Contestazione aperta", "Risultato ancora provvisorio", "Partita rinviata", "Partita sospesa", "Risultato mancante"]) assert.match(migration, new RegExp(label));
});

test("completion is admin-only, locked, stale-safe and idempotent", () => {
  assert.match(route, /guardAdmin\(\)/);
  assert.match(route, /getMondayLeagueAdminActorId/);
  assert.match(migration, /league_assert_admin\(p_actor_id\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /ML_COMPLETION_STALE_PREVIEW/);
  assert.match(migration, /'replayed',true/);
  assert.match(migration, /REVOKE ALL ON FUNCTION[\s\S]*league_complete_season/);
});

test("completion stores one timestamp and compact final evidence", () => {
  assert.match(migration, /ADD COLUMN completed_at/);
  assert.match(migration, /completion_fingerprint/);
  assert.match(migration, /serie_a_standings_fingerprint/);
  assert.match(migration, /serie_b_standings_fingerprint/);
  assert.match(migration, /'season_completed'/);
});

test("completed sporting records are read-only while hard delete remains possible", () => {
  assert.match(migration, /league_reject_completed_sporting_write/);
  assert.match(migration, /BEFORE INSERT OR UPDATE ON public\.league_matches/);
  assert.match(migration, /BEFORE INSERT OR UPDATE ON public\.league_lineups/);
  assert.match(migration, /BEFORE INSERT OR UPDATE ON public\.league_result_submissions/);
  assert.match(migration, /BEFORE INSERT OR UPDATE ON public\.league_result_contests/);
  assert.doesNotMatch(migration, /BEFORE DELETE ON public\.league_/);
});

test("sporting reminders stop and completion message is captain-scoped once", () => {
  assert.match(migration, /event_type IN\('lineup_reminder','match_reminder','missing_result_reminder'\)/);
  assert.match(migration, /status='skipped'/);
  assert.match(migration, /season-completed:user:/);
  assert.match(migration, /Monday League conclusa\. Consulta la classifica finale\./);
  assert.doesNotMatch(migration, /Telegram|Resend|sendEmail|web.?push/i);
});

test("admin preview shows divisions, blockers, standings and guarded confirmation", () => {
  for (const text of ["Chiusura campionato", "Campionato pronto per essere concluso", "Campionato non ancora concluso", "Concludi campionato", "Confermo chiusura Monday League", "Campionato concluso"]) assert.match(admin, new RegExp(text));
  assert.match(admin, /blocking_matches/);
  assert.match(admin, /disabled=\{!ready\.ready\|\|completing\}/);
});

test("public completed state keeps final divisions and correct team default", () => {
  assert.match(publicViews, /Monday League<br \/>Classifica finale/);
  assert.match(publicViews, /Classifica finale/);
  assert.match(publicViews, /Campionato concluso/);
  assert.match(publicModel, /\["phase2", "completed", "archived"\]/);
  assert.match(publicModel, /derivePublicLeagueHeroState/);
});

test("Stage 9 adds no new phase or playoff model", () => {
  assert.doesNotMatch(migration, /semifinal|promotion|relegation/i);
  assert.doesNotMatch(migration, /INSERT INTO public\.league_phases/);
});
