import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LEAGUE_MATCH_STATUSES,
  LEAGUE_PHASE_CODES,
  LEAGUE_SEASON_STATUSES,
  LEAGUE_VENUE_CODES,
  MONDAY_LEAGUE_MAX_PLAYERS_PER_TEAM,
  MONDAY_LEAGUE_MAX_TEAMS,
  MONDAY_LEAGUE_PUBLIC_ROUTE,
  MONDAY_LEAGUE_TIMEZONE,
  mondayLeagueHeroForStatus,
} from "../../src/lib/monday-league/domain.ts";

const migration = readFileSync(
  new URL(
    "../migrations/20260920090000_monday_league_stage1_foundation.sql",
    import.meta.url
  ),
  "utf8"
);
const adminPage = readFileSync(
  new URL("../../src/app/admin/page.tsx", import.meta.url),
  "utf8"
);
const adminFoundationPage = readFileSync(
  new URL("../../src/app/admin/monday-league/page.tsx", import.meta.url),
  "utf8"
);

test("domain constants match the approved Stage 1 contract", () => {
  assert.equal(MONDAY_LEAGUE_MAX_TEAMS, 16);
  assert.equal(MONDAY_LEAGUE_MAX_PLAYERS_PER_TEAM, 4);
  assert.equal(MONDAY_LEAGUE_TIMEZONE, "Europe/Rome");
  assert.equal(MONDAY_LEAGUE_PUBLIC_ROUTE, "/monday-league");
  assert.deepEqual(LEAGUE_SEASON_STATUSES, [
    "draft",
    "phase1",
    "phase2",
    "completed",
    "archived",
  ]);
  assert.deepEqual(LEAGUE_PHASE_CODES, ["phase1", "serie_a", "serie_b"]);
  assert.deepEqual(LEAGUE_VENUE_CODES, ["COSTIGLIOLE", "MANTA", "CENTALLO"]);
  assert.ok(LEAGUE_MATCH_STATUSES.includes("suspended"));
});

test("season status alone derives every approved future home hero state", () => {
  assert.equal(mondayLeagueHeroForStatus("draft").title, "Monday League — Scopri le squadre");
  assert.equal(
    mondayLeagueHeroForStatus("phase1").title,
    "Monday League — Classifica e prossima giornata"
  );
  assert.equal(mondayLeagueHeroForStatus("phase2").title, "Monday League — Serie A & Serie B");
  assert.equal(mondayLeagueHeroForStatus("completed").title, "Monday League — Classifica finale");
});

test("migration is additive, seeds only official configuration, and locks base tables", () => {
  const tables = migration.match(/CREATE TABLE public\.league_[a-z_]+/g) ?? [];
  assert.equal(tables.length, 12);
  assert.doesNotMatch(migration, /INSERT INTO public\.league_(seasons|teams|phases|rounds|matches)/);
  assert.match(migration, /ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.%I FROM anon/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.%I FROM authenticated/);
  assert.match(migration, /GRANT SELECT, INSERT ON TABLE public\.league_audit_events TO service_role/);
  assert.match(migration, /league_matches_unordered_pair_key/);
  assert.match(migration, /league_match_team_slots_round_team_key/);
});

test("admin foundation remains linked after Stage 2 replaces its placeholder", () => {
  assert.match(adminPage, /title: "Monday League"/);
  assert.match(adminPage, /href: "\/admin\/monday-league"/);
  assert.match(adminFoundationPage, /Monday League/);
  assert.match(adminFoundationPage, /Squadre e generazione deterministica della Fase 1/);
});
