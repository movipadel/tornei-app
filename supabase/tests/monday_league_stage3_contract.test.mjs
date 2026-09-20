import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { generateWeeklyMondayDates, isIsoMonday } from "../../src/lib/monday-league/scheduling.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../migrations/20260920170000_monday_league_stage3_scheduling_results.sql");

test("weekly helper proposes Mondays without persistence and permits edits/skips", () => {
  const rounds = [{ id: "r2", round_number: 2 }, { id: "r1", round_number: 1 }, { id: "r3", round_number: 3 }];
  const dates = generateWeeklyMondayDates(rounds, "2026-10-19");
  assert.deepEqual(dates.map((item) => item.playDate), ["2026-10-19", "2026-10-26", "2026-11-02"]);
  dates[2].playDate = "2026-11-09";
  assert.equal(dates[2].playDate, "2026-11-09");
  assert.equal(isIsoMonday("2026-10-20"), false);
  assert.throws(() => generateWeeklyMondayDates(rounds, "2026-10-20"));
});

test("Stage 3 schema is additive, private, revisioned, and dynamically ranked", () => {
  assert.match(migration, /CREATE TABLE public\.league_result_submissions/);
  assert.match(migration, /CREATE TABLE public\.league_match_sets/);
  assert.match(migration, /CREATE TABLE public\.league_match_special_outcomes/);
  assert.match(migration, /CREATE FUNCTION public\.league_get_standings/);
  assert.match(migration, /points DESC,sets_won-sets_lost DESC,games_won-games_lost DESC,tie_break_order ASC/);
  assert.match(migration, /r\.status IN \('submitted','contested','confirmed'\)/);
  assert.match(migration, /WHERE status = 'active'/);
  assert.match(migration, /AT TIME ZONE 'Europe\/Rome'/);
  assert.match(migration, /REVOKE ALL ON public\.league_result_submissions[\s\S]*FROM PUBLIC,anon,authenticated/);
  assert.doesNotMatch(migration, /CREATE TABLE public\.league_standings/);
});

test("all Stage 3 APIs are admin guarded and mutations use transactional RPCs", () => {
  const files = ["schedule/route.ts", "round-dates/route.ts", "schedule/round/route.ts", "standings/route.ts", "results/route.ts"];
  for (const file of files) assert.match(read(`../../src/app/api/admin/monday-league/${file}`), /guardAdmin\(\)/);
  assert.match(read("../../src/app/api/admin/monday-league/round-dates/route.ts"), /league_set_round_dates/);
  assert.match(read("../../src/app/api/admin/monday-league/schedule/round/route.ts"), /league_schedule_round/);
  const results = read("../../src/app/api/admin/monday-league/results/route.ts");
  for (const rpc of ["league_admin_submit_result", "league_admin_correct_result", "league_admin_confirm_result", "league_set_match_special_outcome", "league_set_match_workflow_state"]) assert.match(results, new RegExp(rpc));
});

test("admin navigation and pages expose scheduling, results and standings workflows", () => {
  const nav = read("../../src/app/admin/monday-league/_components/LeagueAdminNav.tsx");
  const calendar = read("../../src/app/admin/monday-league/calendario/page.tsx");
  const results = read("../../src/app/admin/monday-league/risultati/page.tsx");
  const standings = read("../../src/app/admin/monday-league/classifica/page.tsx");
  assert.match(nav, /Calendario/); assert.match(nav, /Classifica/); assert.match(nav, /Risultati/);
  assert.match(calendar, /Genera date settimanali/); assert.match(calendar, /Salva giornata atomicamente/);
  assert.match(results, /DA INSERIRE/); assert.match(results, /Salva correzione/); assert.match(results, /Vittoria a tavolino/); assert.match(results, /Sospendi partita/);
  assert.match(standings, /Classifica provvisoria/); assert.match(standings, /tie_break_order/);
});
