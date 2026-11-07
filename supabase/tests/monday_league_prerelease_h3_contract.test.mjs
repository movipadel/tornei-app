import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(new URL("../migrations/20260925100000_monday_league_prerelease_h3_captain_context.sql", import.meta.url), "utf8");
const readModel = readFileSync(new URL("../../src/lib/monday-league/public-read-model.ts", import.meta.url), "utf8");
const teamView = readFileSync(new URL("../../src/components/monday-league/PublicLeagueViews.tsx", import.meta.url), "utf8");
const matchActions = readFileSync(new URL("../../src/components/monday-league/CaptainMatchActions.tsx", import.meta.url), "utf8");

test("H3 captain selection reuses Stage 6 effective finality at the database clock", () => {
  assert.match(migration, /league_effective_result_status\(m\.current_result_id\) IN \('confirmed','superseded'\)/);
  assert.doesNotMatch(migration, /submitted_at\s*\+\s*interval\s*'48 hours'/i);
  assert.match(migration, /RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public/);
});

test("H3 captain selection follows the active sporting phase and terminal outcomes", () => {
  assert.match(migration, /v_team\.season_status IN \('draft','phase1'\) AND ph\.code='phase1'/);
  assert.match(migration, /v_team\.season_status='phase2' AND ph\.code IN \('serie_a','serie_b'\)/);
  assert.match(migration, /m\.match_status NOT IN\('confirmed','cancelled'\)/);
  assert.match(migration, /so\.id IS NULL/);
  assert.match(migration, /ORDER BY m\.scheduled_at NULLS LAST,m\.created_at,m\.id/);
});

test("team API retains the legacy context but captain actions use match-specific collections", () => {
  assert.equal((readModel.match(/\.rpc\("league_get_captain_context"/g) ?? []).length, 1);
  assert.match(readModel, /captain:\s*captainContext/);
  assert.match(readModel, /\.rpc\("league_get_captain_lineup_matches"/);
  assert.match(teamView, /lineupMatches=\{captain\.lineupMatches\}/);
  assert.match(matchActions, /matches\/\$\{match\.matchId\}\/lineups/);
  assert.doesNotMatch(teamView.split("function CaptainControls")[1].split("const fieldStyle")[0], /captain\.match_id/);
});
