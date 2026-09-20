import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../migrations/20260920130000_monday_league_stage2_teams_generator.sql");
const routes = [
  "../../src/app/api/admin/monday-league/overview/route.ts",
  "../../src/app/api/admin/monday-league/seasons/route.ts",
  "../../src/app/api/admin/monday-league/teams/route.ts",
  "../../src/app/api/admin/monday-league/teams/[id]/route.ts",
  "../../src/app/api/admin/monday-league/users/search/route.ts",
  "../../src/app/api/admin/monday-league/generator/preview/route.ts",
  "../../src/app/api/admin/monday-league/generator/generate/route.ts",
  "../../src/app/api/admin/monday-league/generator/route.ts",
].map(read);

test("every Stage 2 admin route is guarded and server-side", () => {
  for (const route of routes) {
    assert.match(route, /guardAdmin\(\)/);
    assert.match(route, /supabaseAdmin\(\)/);
    assert.doesNotMatch(route, /createBrowserClient|NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  }
});

test("captain search returns a bounded safe projection", () => {
  const search = routes[4];
  assert.match(search, /select\("id,full_name,phone,email"\)/);
  assert.match(search, /\.limit\(12\)/);
  assert.doesNotMatch(search, /password|user_session|auth_token/);
});

test("preview is pure while generation delegates to one transactional RPC", () => {
  const preview = routes[5];
  const generate = routes[6];
  assert.match(preview, /generateMondayLeaguePhase1/);
  assert.doesNotMatch(preview, /\.rpc\(|\.insert\(|\.update\(/);
  assert.match(generate, /generateMondayLeaguePhase1/);
  assert.match(generate, /\.rpc\("league_generate_phase1"/);
  assert.match(generate, /p_fingerprint_payload: generation\.fingerprintPayload/);
});

test("database commands are locked, audited, private, and idempotent", () => {
  assert.match(migration, /CREATE FUNCTION public\.league_save_team/);
  assert.match(migration, /CREATE FUNCTION public\.league_generate_phase1/);
  assert.match(migration, /FOR UPDATE OF p, s/);
  assert.match(migration, /ML_GENERATION_CONFLICT/);
  assert.match(migration, /'created', false, 'replayed', true/);
  assert.match(migration, /'phase1_generated'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.league_generate_phase1[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.league_generate_phase1[\s\S]*TO service_role/);
});

test("admin UI includes team editing, seed ordering, quality, and persisted schedule inspection", () => {
  const teamPage = read("../../src/app/admin/monday-league/squadre/page.tsx");
  const generatorPage = read("../../src/app/admin/monday-league/calendario/genera/page.tsx");
  assert.match(teamPage, /Cerca nome, telefono o email/);
  assert.match(teamPage, /roster\.length < 4/);
  assert.match(teamPage, /Capitano/);
  assert.match(generatorPage, /Ordine seed/);
  assert.match(generatorPage, /Qualità generazione/);
  assert.match(generatorPage, /Anteprima giornate/);
  assert.match(generatorPage, /Giornate generate/);
  assert.match(generatorPage, /non programmata/);
});
