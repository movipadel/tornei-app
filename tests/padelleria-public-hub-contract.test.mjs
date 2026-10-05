import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const page = read("src/app/padelleria/page.tsx");
const css = read("src/app/padelleria/PadelleriaHub.module.css");
const route = read("src/app/api/padelleria/route.ts");
const migration = read("supabase/migrations/20261014100000_padelleria_public_archive.sql");
const home = read("src/app/page.tsx");

test("hub exposes shareable Succede and Archivio tabs with a safe default", () => {
  assert.match(page, /<h1>Succede in Padelleria<\/h1><p>Scopri il mondo MOVI<\/p>/);
  assert.doesNotMatch(page, /sectionHead|padelleria-feed-title|Succede ora/);
  assert.match(page, /get\("view"\) === "archivio" \? "archivio" : "succede"/);
  assert.match(page, /role="tablist"/);
  assert.match(page, /role="tab" aria-selected=/);
  assert.match(page, /href="\/padelleria\?view=archivio"/);
  assert.match(page, /href="\/padelleria"/);
});

test("hub cards are whole-card detail links without nested CTA", () => {
  assert.match(page, /href=\{`\/padelleria\/\$\{item\.id\}`\}/);
  const card = page.slice(page.indexOf("return <Link className={styles.cardLink}"), page.indexOf("</article>"));
  assert.doesNotMatch(card, /cta_url|cta_label|<button/);
  assert.match(page, /item\.kind === "e_successo" \? "È successo" : view === "archivio" \? "Succede · Archivio"/);
});

test("archive predicate excludes future, deleted and ephemeral expired Succede", () => {
  assert.match(migration, /c\.deleted_at IS NULL/);
  assert.match(migration, /c\.status = 'published'/);
  assert.match(migration, /NOT c\.delete_on_expiry/);
  assert.match(migration, /c\.visible_until IS NOT NULL/);
  assert.match(migration, /c\.visible_until < statement_timestamp\(\)/);
  assert.match(migration, /c\.kind = 'e_successo'/);
  assert.match(migration, /coalesce\(c\.occurred_at, c\.visible_until, c\.published_at\) DESC NULLS LAST, c\.id DESC/);
});

test("API is backward compatible and adds limit-plus-one pagination", () => {
  assert.match(route, /view==='archivio'/);
  assert.match(route, /bounds\.limit\+1/);
  assert.match(route, /has_more:hasMore/);
  assert.match(route, /coverOnly:true/);
  assert.match(route, /key!=='delete_on_expiry'/);
});

test("Home is capped at six and links both editorial sections to the hub", () => {
  assert.match(home, /\/api\/padelleria\?kind=succede&limit=6/);
  assert.match(home, /\/api\/padelleria\?kind=e_successo&limit=6/);
  assert.match(home, /title="Succede in Padelleria"[^>]+href="\/padelleria"/);
  assert.match(home, /title="È successo in Padelleria"[^>]+href="\/padelleria\?view=archivio"/);
});

test("responsive hub keeps one mobile column and two editorial desktop columns", () => {
  assert.match(css, /\.grid\{display:grid;gap:16px\}/);
  assert.match(css, /@media\(min-width:700px\)\{\.grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /focus-visible/);
});
