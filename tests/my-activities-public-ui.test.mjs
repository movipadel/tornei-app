import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("my activities exposes only upcoming and history tabs", async () => {
  const [page, model, route] = await Promise.all([
    read("src/app/le-mie-attivita/page.tsx"),
    read("src/lib/activities.ts"),
    read("src/app/api/user/activities/route.ts"),
  ]);
  assert.match(model, /ActivityTab='upcoming'\|'history'/);
  assert.match(model, /activityTabs=\{upcoming:'In programma',history:'Storico'\}/);
  assert.doesNotMatch(page, /Da completare|tab==='action'/);
  assert.doesNotMatch(route, /page\.tab==='action'/);
});

test("real activity types share the certified card hierarchy and destinations", async () => {
  const [page, model, server] = await Promise.all([
    read("src/app/le-mie-attivita/page.tsx"),
    read("src/lib/activities.ts"),
    read("src/lib/activitiesServer.ts"),
  ]);
  for (const type of ["tournament", "gioca", "allenati", "circuit", "monday_league"]) {
    assert.ok(model.includes(type), `missing real activity type ${type}`);
    assert.ok(page.includes(`${type}:`), `missing card family ${type}`);
  }
  assert.doesNotMatch(model, /booking/);
  assert.match(page, /item\.status_label/);
  assert.match(page, /item\.cta_href/);
  for (const destination of ["/le-mie-attivita/richiesta/", "/tornei\?tournament=", "/circuiti/", "/monday-league"]) assert.ok(server.includes(destination));
});

test("current public shell components remain delegated to PublicShell", async () => {
  const [page, shell] = await Promise.all([
    read("src/app/le-mie-attivita/page.tsx"),
    read("src/components/public/PublicShell.tsx"),
  ]);
  assert.match(shell, /<PublicHeader/);
  assert.match(shell, /<PublicBottomNav/);
  assert.doesNotMatch(page, /PublicHeader|PublicBottomNav/);
});

test("responsive activity UI keeps two fitted tabs and reachable controls", async () => {
  const [page, css] = await Promise.all([
    read("src/app/le-mie-attivita/page.tsx"),
    read("src/app/le-mie-attivita/Activities.module.css"),
  ]);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /min-height: 48px/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /@media \(max-width: 350px\)/);
  assert.match(page, /styles\.cardHeading/);
  assert.match(page, /styles\.cardDetails/);
  assert.match(page, /date \? styles\.withDate/);
  assert.match(css, /"icon heading"\s*"details details"\s*"actions actions"/);
  assert.match(css, /"icon heading date"\s*"details details details"\s*"actions actions actions"/);
  assert.doesNotMatch(css, /"icon body date"\s*"\. body body"/);
  assert.match(css, /\.cardActions > \* \{ width: 100%; \}/);
});
