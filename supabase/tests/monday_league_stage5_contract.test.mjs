import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260920210000_monday_league_stage5_captain_lineups.sql");
const model = read("src/lib/monday-league/public-read-model.ts");
const teamApi = read("src/app/api/monday-league/teams/[slug]/route.ts");
const captainUi = read("src/components/monday-league/PublicLeagueViews.tsx");
const mediaApi = read("src/app/api/monday-league/teams/[slug]/media/route.ts");
const lifecycleApi = read("src/app/api/admin/monday-league/season-management/route.ts");
const home = read("src/app/page.tsx");

test("captain identity is cookie derived and commands never trust a body user id", () => {
  assert.match(teamApi, /getUserIdFromCookie/);
  for (const route of ["src/app/api/monday-league/teams/[slug]/profile/route.ts", "src/app/api/monday-league/teams/[slug]/roster/route.ts", "src/app/api/monday-league/matches/[matchId]/lineups/route.ts"]) {
    const source = read(route); assert.match(source, /getUserIdFromCookie/); assert.doesNotMatch(source, /body\.user_id/);
  }
  assert.match(migration, /league_is_captain/);
});

test("lineups are versioned, exactly two and locked at database time equality", () => {
  assert.match(migration, /CREATE TABLE public\.league_lineups/);
  assert.match(migration, /CREATE TABLE public\.league_lineup_players/);
  assert.match(migration, /league_lineups_one_current_key/);
  assert.match(migration, /coalesce\(array_length\(p_player_ids,1\),0\)<>2/);
  assert.match(migration, /now\(\) >= v_match\.scheduled_at - interval '1 hour'/);
  assert.match(migration, /status='superseded',superseded_at=now\(\)/);
});

test("privacy is a database read contract and public DTO contains no player ids before reveal", () => {
  assert.match(migration, /league_get_public_lineups/);
  assert.match(migration, /ELSE NULL END/);
  assert.match(model, /\.rpc\("league_get_public_lineups"/);
  assert.match(model, /lineups:.*null/s);
  assert.match(model, /roster: \(players \?\? \[\]\)\.map\(\(player\) => \(\{ displayName:/);
  assert.match(model, /captainContext = captainResponse\.data/);
  assert.match(captainUi, /Formazione riservata fino alla scadenza/);
  assert.match(migration, /Formazione non comunicata/);
});

test("rescheduling preserves revealed evidence and reopening is symmetric", () => {
  assert.match(migration, /league_matches_preserve_lineup_lock/);
  assert.match(migration, /coalesce\(OLD\.lineups_locked_at,now\(\)\)/);
  assert.match(migration, /league_reopen_lineups/);
  assert.match(migration, /'both_teams',true/);
  assert.match(migration, /ML_NEW_DEADLINE_NOT_FUTURE/);
});

test("profile media is fixed-scope, allow-listed and server authorized", () => {
  assert.match(mediaApi, /monday-league-media/);
  assert.match(mediaApi, /image\/png/); assert.match(mediaApi, /image\/jpeg/); assert.match(mediaApi, /image\/webp/);
  assert.match(mediaApi, /2 \* 1024 \* 1024/); assert.match(mediaApi, /5 \* 1024 \* 1024/);
  assert.match(mediaApi, /league_is_captain/); assert.match(mediaApi, /randomUUID/);
  assert.doesNotMatch(mediaApi, /form\.get\("bucket"\)|form\.get\("path"\)/);
});

test("visibility, archive and delete remain independent and isolated", () => {
  assert.match(migration, /public_visibility/);
  assert.match(model, /\.eq\("public_visibility", "public"\)/);
  assert.match(migration, /status NOT IN \('completed','archived'\)/);
  assert.match(migration, /league_season_deletion_log/);
  assert.match(lifecycleApi, /startsWith\(`monday-league\/\$\{body\.season_id\}\//);
  assert.match(lifecycleApi, /league_mark_storage_cleanup/);
});

test("captain controls share the public team page and home hero precedes circuits", () => {
  for (const label of ["Modifica profilo squadra", "Gestisci rosa", "Inserisci formazione", "Rosa ufficiale — per modifiche contatta"]) assert.ok(captainUi.includes(label));
  assert.ok(home.indexOf("mondayLeagueHero.visible") < home.indexOf("Circuiti MOVI"));
  assert.match(home, /href="\/monday-league"/);
});
