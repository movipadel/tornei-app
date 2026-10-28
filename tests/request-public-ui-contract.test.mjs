import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const form = read("src/app/richieste/RequestForm.tsx");
const css = read("src/app/richieste/RequestForm.module.css");
const modal = read("src/components/public/PublicModal.tsx");
const gioca = read("src/app/richieste/gioca/page.tsx");
const allenati = read("src/app/richieste/allenati/page.tsx");

test("Gioca and Allenati keep their routed entry points and one shared form", () => {
  assert.match(gioca, /RequestForm type="gioca"/);
  assert.match(allenati, /RequestForm type="allenati"/);
  assert.match(form, /type RequestType = "gioca" \| "allenati"/);
  assert.match(form, /<PublicModal/);
});

test("all real request fields and exact submit payload remain present", () => {
  for (const field of ["clubs", "date_mode", "requested_date", "time_window", "preferred_time_text", "level", "match_type", "group_size", "required_player_side", "training_type", "training_goal", "notes", "client_request_id"]) {
    assert.match(form, new RegExp(field));
  }
  assert.match(form, /body: JSON\.stringify\(\{ \.\.\.data, client_request_id: key \}\)/);
  assert.match(form, /fetch\("\/api\/user\/requests"/);
});

test("Gioca keeps requester side separate from group size and missing fourth-player side", () => {
  assert.match(form, /Con chi cerchi la partita\?/);
  assert.match(form, /Sono da solo/);
  assert.match(form, /Siamo in 2/);
  assert.match(form, /Siamo in 3/);
  assert.match(form, /Che giocatore vi manca\?/);
  assert.match(form, /Lato di gioco/);
  assert.match(form, /data\.group_size===3/);
  assert.ok(form.indexOf('Che giocatore vi manca?') < form.indexOf('Lato di gioco'));
});

test("option tiles have semantic inputs, selected indicators and stable focus treatment", () => {
  assert.match(form, /type="radio"/);
  assert.match(form, /type="checkbox"/);
  assert.match(form, /checked=\{selected\}/);
  assert.match(form, /<Check[^>]+aria-hidden/);
  assert.match(css, /min-height:48px/);
  assert.match(css, /\.choice\[data-selected\]/);
  assert.match(css, /\.choice:focus-within/);
});

test("Gioca and Allenati multi-selects enforce catch-all exclusivity", () => {
  assert.match(form, /function MultiChoiceGroup/);
  assert.match(form, /exclusiveValue="any"/);
  assert.match(form, /exclusiveValue="advice"/);
  assert.match(form, /option\.value === exclusiveValue \? \[option\.value\]/);
  assert.match(form, /value=\{data\.training_goal \?\? \[\]\}/);
});

test("validation, loading and login recovery stay visible and accessible", () => {
  assert.match(form, /type="date" required/);
  assert.match(form, /role="alert"/);
  assert.match(form, /loading=\{busy\}/);
  assert.match(form, /setLogin\(response\.status === 401\)/);
  assert.match(form, /href="\/accedi"/);
});

test("success state is contextual and links to activities", () => {
  assert.match(form, /Richiesta inviata!/);
  assert.match(form, /Cosa succede ora\?/);
  assert.match(form, /type === "gioca" \? "la partita giusta" : "la soluzione di allenamento giusta"/);
  assert.match(form, /href="\/le-mie-attivita"/);
  assert.match(form, /Ok, perfetto!/);
  assert.match(form, /role="status" aria-live="polite"/);
});

test("dialog preserves the shared Radix focus, Escape and close behavior", () => {
  assert.match(form, /onOpenChange=\{\(open\) => \{ if \(!open\) close\(\); \}\}/);
  assert.match(modal, /@radix-ui\/react-dialog/);
  assert.match(modal, /<Dialog\.Content/);
  assert.match(modal, /<Dialog\.Close/);
  assert.match(modal, /onCloseAutoFocus=\{onCloseAutoFocus\}/);
});

test("mobile and desktop rules keep one scrollable centered modal", () => {
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(min-width:440px\)/);
  assert.match(css, /@media\(max-width:340px\)/);
  assert.doesNotMatch(css, /position:sticky/);
});

test("mobile Gioca and Allenati copy uses the shared readable type scale", () => {
  assert.match(form, /className=\{styles\.intro\}/);
  assert.match(css, /@media\(max-width:520px\)[\s\S]*\.intro\{font-size:15px;line-height:1\.5\}/);
  assert.match(css, /@media\(max-width:520px\)[\s\S]*\.fieldset legend,[^}]*font-size:15px;line-height:1\.35/);
  assert.match(css, /@media\(max-width:520px\)[\s\S]*\.choice\{font-size:14px;line-height:1\.3\}/);
});
