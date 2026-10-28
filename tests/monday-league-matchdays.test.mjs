import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getDefaultOpenMatchdayIds,
  getMatchdaySummary,
  toggleOpenMatchday,
} from "../src/lib/monday-league/matchday-ui.ts";

const ui = readFileSync(new URL("../src/components/monday-league/PublicLeagueViews.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/monday-league/MondayLeague.module.css", import.meta.url), "utf8");
const result = (status = "confirmed") => ({ status });
const round = (id, results) => ({ id, matches: results.map((item) => ({ result: item })) });

test("latest completed and next upcoming matchdays open by default", () => {
  const rounds = [
    round("one", [result(), result()]),
    round("two", [result(), result()]),
    round("three", [null, null]),
    round("four", [null, null]),
  ];
  assert.deepEqual(getDefaultOpenMatchdayIds(rounds), ["two", "three"]);
});

test("partially played current and next future matchdays open by default", () => {
  const rounds = [
    round("one", [result(), result()]),
    round("two", [result(), null]),
    round("three", [null, null]),
  ];
  assert.deepEqual(getDefaultOpenMatchdayIds(rounds), ["two", "three"]);
});

test("all completed opens only the most recent matchday", () => {
  const rounds = [round("one", [result()]), round("two", [result("special")])];
  assert.deepEqual(getDefaultOpenMatchdayIds(rounds), ["two"]);
});

test("none played opens only the first upcoming matchday", () => {
  const rounds = [round("one", [null, null]), round("two", [null, null])];
  assert.deepEqual(getDefaultOpenMatchdayIds(rounds), ["one"]);
});

test("matchday toggle preserves independent session state", () => {
  const opened = new Set(["one", "two"]);
  assert.deepEqual([...toggleOpenMatchday(opened, "one")], ["two"]);
  assert.deepEqual([...toggleOpenMatchday(opened, "three")], ["one", "two", "three"]);
  assert.deepEqual([...opened], ["one", "two"]);
});

test("collapsed summaries reflect definitive, mixed and upcoming data", () => {
  assert.equal(getMatchdaySummary(round("done", [result(), result(), result(), result()])), "4 incontri · 4 definitivi");
  assert.equal(getMatchdaySummary(round("mixed", [result(), result("submitted"), null, null])), "4 incontri · 2 giocati · 2 da giocare");
  assert.equal(getMatchdaySummary(round("future", [null, null, null, null])), "4 incontri · da giocare");
});

test("accordion keeps match cards and exposes button semantics", () => {
  assert.match(ui, /<button[\s\S]*?className=\{styles\.roundToggle\}[\s\S]*?aria-expanded=\{expanded\}[\s\S]*?aria-controls=\{contentId\}/);
  assert.match(ui, /onClick=\{\(\) => setOpenRoundIds\(\(current\) => toggleOpenMatchday\(current, round\.id\)\)\}/);
  assert.match(ui, /role="region" aria-labelledby=\{toggleId\}[\s\S]*?hidden=\{!expanded\}[\s\S]*?round\.matches\.map\(\(match\) => <MatchCard/);
  assert.match(css, /\.roundToggle \{[^}]*min-height: 64px/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.roundToggle \{[^}]*min-height: 58px/);
  assert.match(css, /\.roundToggle:focus-visible/);
});
