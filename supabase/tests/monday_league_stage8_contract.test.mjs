import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { generateMondayLeagueRoundRobin } from "../../src/lib/monday-league/generator.ts";

const migration=readFileSync("supabase/migrations/20260922100000_monday_league_stage8_phase2_generation.sql","utf8");
const route=readFileSync("src/app/api/admin/monday-league/phase2/route.ts","utf8");
const page=readFileSync("src/app/admin/monday-league/fase-2/page.tsx","utf8");
const publicModel=readFileSync("src/lib/monday-league/public-read-model.ts","utf8");
const publicUi=readFileSync("src/components/monday-league/PublicLeagueViews.tsx","utf8");
const scheduleRoute=readFileSync("src/app/api/admin/monday-league/schedule/route.ts","utf8");

function division(size, offset=0){const ids=Array.from({length:size},(_,i)=>`${offset+i+1}`.padStart(36,"0"));return generateMondayLeagueRoundRobin(`phase-${size}-${offset}`,ids,[...ids].reverse());}
for(const total of [16,15,13]) test(`${total} teams split ceil/floor into complete one-leg divisions`,()=>{
  const a=Math.ceil(total/2),b=Math.floor(total/2);const ga=division(a),gb=division(b,20);
  assert.equal(a+b,total);assert.equal(ga.rounds.length,a%2?a:a-1);assert.equal(gb.rounds.length,b%2?b:b-1);
  assert.equal(ga.matchCount,a*(a-1)/2);assert.equal(gb.matchCount,b*(b-1)/2);
  assert.equal(ga.quality.invariantViolations.length,0);assert.equal(gb.quality.invariantViolations.length,0);
  assert.equal(ga.rounds.some(r=>r.matches.some(m=>m.homeTeamId===m.awayTeamId)),false);
});

test("readiness delegates ordering to Stage 3 and recognizes authoritative terminal states",()=>{
  assert.match(migration,/v_standings:=public\.league_get_standings/);
  assert.match(migration,/league_effective_result_status\(r\.id\)='confirmed'/);
  assert.match(migration,/Contestazione aperta/);assert.match(migration,/Partita rinviata/);assert.match(migration,/Partita sospesa/);assert.match(migration,/Risultato mancante/);
});

test("split snapshot, fingerprint and stale preview are database authoritative",()=>{
  assert.match(migration,/input_team_order.*v_snapshot/s);assert.match(migration,/match_state/);
  assert.match(migration,/ML_PHASE2_STALE_PREVIEW/);assert.match(route,/expected_fingerprint/);
  assert.match(migration,/pg_advisory_xact_lock/);assert.match(migration,/generation_kind='phase2_split'/);
});

test("phase memberships reset statistics and preserve source tie break",()=>{
  assert.match(migration,/\(x->>'tie_break_order'\)::integer/);
  assert.match(migration,/source_phase_position/);
  assert.doesNotMatch(migration,/INSERT INTO public\.(league_standings|league_team_totals)/);
});

test("admin generation is guarded, confirmed and disabled until ready",()=>{
  assert.match(route,/guardAdmin/);assert.match(route,/getMondayLeagueAdminActorId/);
  assert.match(page,/window\.confirm/);assert.match(page,/disabled=\{!ready\.ready\|\|generating\}/);
  assert.match(page,/Fase 1 pronta per la divisione/);assert.match(page,/Fase 1 non ancora conclusa/);
});

test("public navigation keeps Phase 1 and both divisions discoverable",()=>{
  assert.match(publicModel,/league_phases/);assert.match(publicModel,/phase\.code !== "phase1"/);
  assert.match(publicModel,/membership\.phase_id/);assert.match(publicUi,/Serie A &amp; Serie B/);
  assert.match(publicUi,/PhaseNav phases=\{data\.phases\}/);
});

test("Stage 3 scheduler selects any generated league phase",()=>{
  assert.match(scheduleRoute,/searchParams\.get\("phase"\)/);
  assert.match(scheduleRoute,/\.in\("status", \["generated","in_progress","finalized"\]\)/);
  assert.doesNotMatch(scheduleRoute,/\.eq\("code", "phase1"\)/);
});

test("Phase 2 notifications are transactional, division-specific and idempotent",()=>{
  assert.match(migration,/PERFORM public\.league_enqueue_phase2_ready\(p_season_id,p_serie_a_phase_id\)/);
  assert.match(migration,/La tua squadra è in '\|\|v_name/);
  assert.match(migration,/:phase:'\|\|p_phase_id\|\|':phase2-ready:user:/);
});

test("completion is only a readiness foundation and no playoffs are generated",()=>{
  assert.match(migration,/league_phase2_completion_readiness/);
  assert.doesNotMatch(migration,/semifinal|playoff|promotion_match|relegation_match/i);
});
