import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const model = read("src/lib/monday-league/public-read-model.ts");
const api = read("src/app/api/monday-league/route.ts");
const teamApi = read("src/app/api/monday-league/teams/[slug]/route.ts");
const ui = read("src/components/monday-league/PublicLeagueViews.tsx");
const css = read("src/app/monday-league/MondayLeague.module.css");

test("publication gate requires explicit Stage 5 visibility and publication", () => {
  assert.match(model, /\.in\("status", VISIBLE_SEASON_STATES\)/);
  assert.match(model, /\.not\("published_at", "is", null\)/);
  assert.match(model, /\.lte\("published_at", now\)/);
  assert.match(model, /\.eq\("public_visibility", "public"\)/);
});

test("public APIs are GET-only, dynamic and no-store", () => {
  for (const source of [api, teamApi]) {
    assert.match(source, /export async function GET/);
    assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/);
    assert.match(source, /Cache-Control": "no-store"/);
    assert.match(source, /dynamic = "force-dynamic"/);
  }
});

test("read model uses explicit allow-listed projections", () => {
  assert.doesNotMatch(model, /\.select\(["'`]\*["'`]\)/);
  assert.doesNotMatch(model, /phone|email|audit_events|generation_fingerprint|decided_by_staff_id|correction_reason/);
  assert.match(model, /actualPlayers: \{ home: \[\], away: \[\] \}/);
});

test("standings remain delegated to the Stage 3 engine", () => {
  assert.match(model, /\.rpc\("league_get_standings"/);
  assert.match(ui, /Classifica provvisoria/);
  assert.match(ui, /Diff set/);
  assert.match(ui, /Diff game/);
});

test("calendar exposes safe pending labels and human special outcomes", () => {
  for (const label of ["Data da definire", "Orario da definire", "Sede da definire", "Vittoria a tavolino", "No-show", "Sospesa", "Rinviata", "Annullata"]) assert.ok(model.includes(label) || ui.includes(label));
  assert.match(ui, /Nessun set giocato è stato registrato/);
});

test("result expansion is keyboard accessible and reports state", () => {
  assert.match(ui, /<button type="button" className=\{styles\.matchRow\}/);
  assert.match(ui, /aria-expanded=\{expanded\}/);
  assert.match(ui, /role="region"/);
});

test("team experience includes safe roster, metrics, next match and schedule", () => {
  for (const label of ["Capitano", "Posizione", "Punti", "Diff set", "Diff game", "Prossima partita", "Prossime giornate", "Risultati"]) assert.ok(ui.includes(label));
  assert.match(model, /roster: \(players \?\? \[\]\)\.map\(\(player\) => \(\{ displayName:/);
});

test("responsive styles cover phone layout", () => {
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /grid-template-columns: 74px minmax\(0, 1fr\)/);
  assert.match(css, /overflow-x: auto/);
});
