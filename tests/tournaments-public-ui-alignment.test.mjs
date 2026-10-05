import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const page = read("src/app/tornei/page.tsx");
const card = read("src/components/tournaments/TournamentCard.tsx");
const pageCss = read("src/app/tornei/TorneiPage.module.css");
const cardCss = read("src/components/tournaments/TournamentCard.module.css");

test("catalogue preserves its established data, registration and deep-link flows", () => {
  assert.match(page, /fetch\("\/api\/tournaments"/);
  assert.match(page, /fetch\("\/api\/registrations\/search"/);
  assert.match(page, /method: "DELETE"/);
  assert.match(page, /get\('tournament'\)/);
  assert.match(page, /scrollIntoView\(\{ block: 'center' \}\)/);
  assert.match(page, /focus\(\{ preventScroll: true \}\)/);
});

test("catalogue uses the public shell visual tokens and a visible deep-link focus", () => {
  assert.match(pageCss, /var\(--public-bg\)/);
  assert.match(pageCss, /\.focusTarget:focus/);
  assert.match(cardCss, /var\(--public-surface-1\)/);
  assert.match(cardCss, /outline:\s*3px solid var\(--public-cyan\)/);
});

test("cards retain real media, fallback, circuit and registration states", () => {
  assert.match(card, /tournament\.image_url \|\| getTournamentHomeBackground/);
  assert.match(page, /circuitName=\{circuits\.find/);
  assert.match(card, /status === "reserve" \? "In riserva" : "Iscritto"/);
  assert.match(card, /counts\.main/);
});

test("no unsupported filter behavior was invented", () => {
  assert.doesNotMatch(page, /setLevelFilter|setCategoryFilter|filteredTournaments/);
});

test("final header uses the approved compact copy without eyebrow or intro card", () => {
  assert.match(page, /<h1>I Tornei della Padelleria<\/h1>/);
  assert.match(page, /Partecipa e gestisci le tue iscrizioni\./);
  assert.doesNotMatch(page, /<span className=\{styles\.eyebrow\}>|Informazioni sul catalogo tornei|Qui trovi tutti i tornei futuri/);
  assert.doesNotMatch(pageCss, /\.eyebrow|\.infoIcon|\.info\s*\{/);
});
