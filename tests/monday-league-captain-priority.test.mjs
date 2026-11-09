import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");
const source = readFileSync(new URL("../src/components/monday-league/CaptainMatchActions.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../src/components/monday-league/PublicLeagueViews.tsx", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const effects = [];
const scrolled = [];
const styles = new Proxy({}, { get: (_, name) => String(name) });
const runtimeModule = { exports: {} };
const dependencies = {
  react: { ...React, useEffect: (callback) => effects.push(callback) },
  "react/jsx-runtime": require("react/jsx-runtime"),
  sonner: { toast: {} },
  "@/app/monday-league/MondayLeague.module.css": { __esModule: true, default: styles },
};
const document = { getElementById: (id) => ({ scrollIntoView: () => scrolled.push(id) }) };
new Function("require", "module", "exports", "document", output)(
  (name) => {
    assert.ok(Object.hasOwn(dependencies, name), `unexpected import: ${name}`);
    return dependencies[name];
  }, runtimeModule, runtimeModule.exports, document,
);

const scheduled = (round) => ({
  matchId: `g${round}`, roundNumber: round, opponentName: `Squadra ${round}`, status: "scheduled",
  scheduledAt: "2026-11-16T19:00:00Z", venueName: "MOVI", lineupDeadline: "2026-11-16T18:00:00Z",
  lineupLocked: false, canSubmitLineup: true, ownLineup: null, opponentLineup: null,
});
const result = (id, overrides = {}) => ({
  matchId: id, roundNumber: 4, opponentName: "Avversari", status: "scheduled", scheduledAt: "2026-11-09T19:00:00Z",
  resultId: null, isAwayCaptain: false, canSubmitResult: true, canContestResult: false,
  effectiveStatus: null, submittedAt: null, contestDeadline: null, summary: null, sets: [], contestSubmitted: false,
  ...overrides,
});

function render(lineupMatches = [], resultMatches = [], focusMatchId = null) {
  effects.length = 0;
  scrolled.length = 0;
  const html = renderToStaticMarkup(React.createElement(runtimeModule.exports.CaptainMatchActions, {
    teamId: "team", roster: [], lineupMatches, resultMatches, onSaved: () => {}, focusMatchId,
  }));
  effects.forEach((effect) => effect());
  return { html, headings: [...html.matchAll(/<h3>(.*?)<\/h3>/g)].map((match) => match[1]), scrolled: [...scrolled] };
}

test("A: one actionable result precedes nine future lineup cards and captain profile editing", () => {
  const { html, headings } = render(Array.from({ length: 9 }, (_, index) => scheduled(index + 5)), [result("g4")]);
  assert.deepEqual(headings, ["Risultati da gestire", "Prossimo incontro", "Altri incontri programmati"]);
  assert.ok(html.indexOf('id="result-g4"') < html.indexOf('id="lineup-g5"'));
  assert.equal((html.match(/id="lineup-g\d+"/g) ?? []).length, 9);
  const controls = pageSource.split("function CaptainControls")[1].split("const fieldStyle")[0];
  assert.ok(controls.indexOf("<CaptainMatchActions") < controls.indexOf("Modifica profilo squadra"));
});

test("B: every actionable result precedes future lineups; submitted results remain informational", () => {
  const submitted = result("sent", { resultId: "result-sent", canSubmitResult: false, effectiveStatus: "submitted", summary: "2–0" });
  const { html, headings } = render([scheduled(5), scheduled(6)], [result("g4a"), result("g4b"), submitted]);
  assert.deepEqual(headings, ["Risultati da gestire", "Prossimo incontro", "Altri incontri programmati", "Risultati inviati"]);
  assert.ok(html.indexOf('id="result-g4a"') < html.indexOf('id="lineup-g5"'));
  assert.ok(html.indexOf('id="result-g4b"') < html.indexOf('id="lineup-g5"'));
  assert.ok(html.indexOf('id="result-sent"') > html.indexOf('id="lineup-g6"'));
});

test("C: without urgent results, the next scheduled lineup is first", () => {
  assert.deepEqual(render([scheduled(5), scheduled(6)]).headings, ["Prossimo incontro", "Altri incontri programmati"]);
  assert.deepEqual(render([scheduled(5)]).headings, ["Prossimo incontro"]);
  assert.match(render().html, /Nessun incontro da gestire al momento/);
});

test("D: postponed recovery result and lineup precede scheduled and future lineups", () => {
  const recoveryLineup = { ...scheduled(3), matchId: "recovery", status: "postponed", scheduledAt: null, lineupDeadline: null };
  const { html, headings } = render([scheduled(5), scheduled(6), recoveryLineup], [result("recovery", { status: "postponed" })]);
  assert.deepEqual(headings, ["Recuperi da giocare", "Prossimo incontro", "Altri incontri programmati"]);
  assert.ok(html.indexOf('id="result-recovery"') < html.indexOf('id="lineup-recovery"'));
  assert.ok(html.indexOf('id="lineup-recovery"') < html.indexOf('id="lineup-g5"'));
});

test("E: match deep link scrolls to an owned result or lineup, never a foreign match", () => {
  assert.deepEqual(render([scheduled(5)], [result("g4")], "g4").scrolled, ["result-g4"]);
  assert.deepEqual(render([scheduled(5)], [result("g4")], "g5").scrolled, ["lineup-g5"]);
  assert.deepEqual(render([scheduled(5)], [result("g4")], "foreign").scrolled, []);
  assert.match(render([scheduled(5)], [result("g4")], "g4").html, /id="result-g4" class="captainMatchCard captainMatchFocus"/);
});

test("F: result and lineup actions remain gated by their existing permissions", () => {
  const deniedLineup = { ...scheduled(5), canSubmitLineup: false };
  const deniedResult = result("g4", { resultId: "result-g4", canSubmitResult: false, canContestResult: false, summary: "2–0" });
  const denied = render([deniedLineup], [deniedResult]);
  assert.doesNotMatch(denied.html, /Inserisci risultato|Schiera formazione|Contesta risultato/);
  assert.deepEqual(denied.headings, ["Risultati inviati"]);
  assert.match(render([], [result("g4")]).html, /Inserisci risultato/);
  assert.match(render([scheduled(5)]).html, /Schiera formazione/);
  assert.match(render([], [result("g4", { resultId: "result-g4", canSubmitResult: false, canContestResult: true, summary: "2–0" })]).html, /Contesta risultato/);
  assert.match(source, /\/api\/monday-league\/matches\/\$\{match\.matchId\}\/result/);
  assert.match(source, /\/api\/monday-league\/matches\/\$\{match\.matchId\}\/contest/);
  assert.match(source, /\/api\/monday-league\/matches\/\$\{match\.matchId\}\/lineups/);
});
