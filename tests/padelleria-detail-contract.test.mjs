import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("single-content API is no-store, UUID-scoped, visibility-gated and minimal", async () => {
  const [route, server] = await Promise.all([
    read("src/app/api/padelleria/[id]/route.ts"),
    read("src/lib/padelleriaServer.ts"),
  ]);
  assert.match(route, /publicContentDetail\(id\)/);
  assert.match(route, /Contenuto non trovato.*404/s);
  assert.match(server, /if\(!isUuid\(id\)\)return null/);
  assert.match(server, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(server, /publicReadClient\(\)\.from\('padelleria_contents'\)/);
  assert.match(server, /padelleria_is_public\(\) predicate uses the database clock/);
  assert.match(server, /if\(!data\)return null/);
  const detail = server.slice(server.indexOf("export async function publicContentDetail"));
  assert.ok(detail.indexOf("if(!data)return null") < detail.indexOf("withMedia([data]"), "media must be signed only after the RLS-visible row exists");
  assert.match(server, /withMedia\(\[data\],\{tolerateErrors:true\}\)/);
  const returned = server.slice(server.indexOf("return {id:item.id"), server.indexOf("};", server.indexOf("return {id:item.id")));
  for (const field of ["title", "excerpt", "body", "kind", "occurred_at", "published_at", "cta_label", "cta_url", "media"]) assert.ok(returned.includes(field));
  for (const field of ["delete_on_expiry", "deleted_at", "sort_order", "featured", "status"]) assert.ok(!returned.includes(field));
});

test("detail page uses the shared public shell and one architecture for both kinds", async () => {
  const page = await read("src/app/padelleria/[id]/page.tsx");
  assert.match(page, /publicContentDetail\(id\)/);
  assert.match(page, /if\(!item\)notFound\(\)/);
  assert.match(page, /item\.kind==='succede'\?'Succede':'È successo'/);
  assert.match(page, /href="\/padelleria"[^>]*>.*Torna alla Padelleria/s);
  assert.match(page, /item\.occurred_at\?\?item\.published_at/);
  assert.match(page, /\{item\.body\}/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML|marked\(|remark|markdown/i);
  await access(new URL("../src/app/padelleria/page.tsx", import.meta.url));
});

test("cover, gallery, videos and CTA follow the approved safe behavior", async () => {
  const [page, model] = await Promise.all([read("src/app/padelleria/[id]/page.tsx"), read("src/lib/padelleria.ts")]);
  assert.match(page, /role==='cover'&&media\.url/);
  assert.match(page, /role==='gallery'&&media\.url/);
  assert.match(page, /videoEmbed\(item\.external_url as string\)/);
  assert.match(page, /<iframe[^>]+title=/);
  assert.match(page, /safeCta\(item\.cta_url\)/);
  assert.match(page, /target="_blank" rel="noopener noreferrer"/);
  assert.match(page, /<Link[^>]+href=\{cta\.url\}/);
  assert.match(model, /youtube-nocookie\.com\/embed/);
  assert.match(model, /player\.vimeo\.com\/video/);
});

test("Home cards are always semantic internal links and never expose CTA controls", async () => {
  const [home, css] = await Promise.all([read("src/app/page.tsx"), read("src/app/HomeV2.module.css")]);
  const editorial = home.slice(home.indexOf("function EditorialCarousel"), home.indexOf("function HomeTournamentCard"));
  assert.match(editorial, /<Link[^>]+href=\{`\/padelleria\/\$\{item\.id\}`\}/);
  assert.match(editorial, /aria-label=\{`Apri \$\{item\.title\}`\}/);
  assert.doesNotMatch(editorial, /item\.cta_url|item\.cta_label|<button|<a|Apri contenuto/);
  assert.match(css, /\.editorialCardLink:focus-visible/);
});

test("detail layout includes all approved responsive widths without horizontal overflow", async () => {
  const css = await read("src/app/padelleria/[id]/PadelleriaDetail.module.css");
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /@media\(min-width:440px\)/);
  assert.match(css, /@media\(min-width:768px\)/);
  assert.match(css, /@media\(min-width:1280px\)/);
  assert.match(css, /aspect-ratio:16\/9/);
});
