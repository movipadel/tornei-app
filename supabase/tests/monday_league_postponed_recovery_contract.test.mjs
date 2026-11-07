import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261107142512_monday_league_postponed_recovery_multi_match.sql");
const model = read("src/lib/monday-league/public-read-model.ts");
const captainUI = read("src/components/monday-league/CaptainMatchActions.tsx");
const teamUI = read("src/components/monday-league/PublicLeagueViews.tsx");
const route = read("src/app/monday-league/squadre/[slug]/page.tsx");

test("captain receives match collections instead of using a singular lineup for actions", () => {
  const lineupContext = migration.split("CREATE FUNCTION public.league_get_captain_lineup_matches")[1]
    .split("CREATE OR REPLACE FUNCTION public.league_captain_submit_result")[0];
  assert.match(lineupContext, /jsonb_agg\(item ORDER BY scheduled_at NULLS LAST/);
  assert.doesNotMatch(lineupContext, /LIMIT\s+1/i);
  assert.match(model, /league_get_captain_lineup_matches/);
  assert.match(model, /league_get_captain_result_matches/);
  assert.match(teamUI, /lineupMatches=\{captain\.lineupMatches\}/);
  assert.doesNotMatch(teamUI.split("function CaptainControls")[1].split("const fieldStyle")[0], /captain\.match_id/);
});

test("scheduled and postponed lineup eligibility share one SQL authority", () => {
  assert.match(migration, /CREATE FUNCTION public\.league_lineup_actionable/);
  assert.match(migration, /p_status='postponed' OR/);
  assert.match(migration, /p_status='scheduled' AND p_scheduled_at IS NOT NULL/);
  assert.match(migration, /p_locked_at IS NULL AND now\(\)<p_scheduled_at-interval '1 hour'/);
  assert.match(migration, /IF NOT public\.league_lineup_actionable\(v_match\.match_status/);
  assert.match(migration, /m\.current_result_id IS NULL AND m\.current_special_outcome_id IS NULL/);
});

test("recovery result uses the canonical result submission and contest paths", () => {
  assert.match(migration, /OR v_match\.match_status='postponed'/);
  assert.match(migration, /UPDATE public\.league_matches SET current_result_id=v_result_id,match_status='submitted'/);
  assert.match(captainUI, /\/api\/monday-league\/matches\/\$\{match\.matchId\}\/result/);
  assert.match(captainUI, /\/api\/monday-league\/matches\/\$\{match\.matchId\}\/contest/);
});

test("match-targeted reminders and captain deep links do not accept a foreign match", () => {
  assert.match(migration, /NEW\.match_id IS NOT NULL/);
  assert.match(migration, /\?match=/);
  assert.match(route, /initialMatchId=\{query\.match\}/);
  assert.match(captainUI, /focusIsOwnMatch/);
  assert.match(captainUI, /\.some\(\(match\) => match\.matchId === focusMatchId\)/);
  assert.match(captainUI, /Prossimo incontro/);
  assert.match(captainUI, /Recuperi da giocare/);
  assert.match(captainUI, /Nessun incontro da gestire/);
});
