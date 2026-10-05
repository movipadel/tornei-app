import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Partner directory uses the real public API, categories and canonical slug links", async () => {
  const source = await read("src/app/partner/page.tsx");
  assert.match(source, /fetch\(`\/api\/partners\?limit=\$\{PAGE_SIZE\}&offset=\$\{offset\}`/);
  assert.match(source, /categories\.filter\(\(category\) => items\.some\(\(item\) => item\.category === category\)\)/);
  assert.match(source, /href=\{`\/partner\/\$\{partner\.slug\}`\}/);
  assert.match(source, /partner\.benefit_title/);
  assert.match(source, /partner\.benefit_description/);
});

test("Partner detail is fail-closed and renders the real benefit", async () => {
  const [page, server, api] = await Promise.all([
    read("src/app/partner/[slug]/page.tsx"),
    read("src/lib/partnersServer.ts"),
    read("src/app/api/partners/[slug]/route.ts"),
  ]);
  assert.match(page, /publicPartnerBySlug\(slug\)/);
  assert.match(page, /if \(!partner\) notFound\(\)/);
  assert.match(server, /movi_partners_public_list/);
  assert.match(api, /publicPartnerBySlug/);
  assert.match(page, /partner\.benefit_title/);
  assert.match(page, /partner\.benefit_description/);
  assert.match(page, /partner\.conditions/);
});

test("Partner detail instructs visual membership verification and contains no QR or scanner", async () => {
  const source = await read("src/app/partner/[slug]/page.tsx");
  assert.match(source, /Mostra la tua tessera MOVI per usufruire del vantaggio\./);
  assert.doesNotMatch(source, /QRCode|QR code|barcode|NFC|contactless|scanner|membership_code/i);
});

test("Partner contacts are conditional and use external directions rather than an embedded map", async () => {
  const source = await read("src/app/partner/[slug]/page.tsx");
  assert.match(source, /address \? <div className=\{styles\.contactRow\}/);
  assert.match(source, /phone \? <div className=\{styles\.contactRow\}/);
  assert.match(source, /website \? <div className=\{styles\.contactRow\}/);
  assert.match(source, /contact \? <div className=\{styles\.contactRow\}/);
  assert.match(source, /https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
  assert.doesNotMatch(source, /<iframe|google\.maps\.Map|mapbox|leaflet/i);
});

test("Partner public UI has no unsupported favorites or application flow", async () => {
  const [directory, detail] = await Promise.all([read("src/app/partner/page.tsx"), read("src/app/partner/[slug]/page.tsx")]);
  const source = `${directory}\n${detail}`;
  assert.doesNotMatch(source, /Heart|favorite|favourite|preferit|localStorage/i);
  assert.doesNotMatch(source, /Vuoi diventare Partner|Diventa Partner|partner application/i);
});
