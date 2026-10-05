import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  STATIC_CTA_DESTINATIONS,
  assertNotPadelleriaSelfLink,
  buildCircuitCtaHref,
  buildPadelleriaCtaHref,
  buildPartnerCtaHref,
  buildTournamentCtaHref,
  canonicalizeExternalCtaUrl,
  filterCircuitCtaOptions,
  filterPadelleriaCtaOptions,
  filterPartnerCtaOptions,
  includePreservedOption,
  matchCtaDestination,
  shouldApplyCtaLabelSuggestion,
  validateCustomInternalPath,
} from "../src/lib/publicCtaDestinations.ts";

const tournamentId = "11111111-1111-4111-8111-111111111111";
const contentId = "22222222-2222-4222-8222-222222222222";

test("static destinations round-trip without changing their href", () => {
  for (const destination of STATIC_CTA_DESTINATIONS) {
    assert.deepEqual(matchCtaDestination(destination.href), { mode: "catalog", key: destination.key });
  }
  assert.equal(STATIC_CTA_DESTINATIONS.some((item) => item.label === "Partner" && item.href === "/partner"), true);
});

test("dynamic tournament, circuit and Padelleria destinations round-trip", () => {
  const tournament = buildTournamentCtaHref(tournamentId);
  assert.equal(tournament, `/tornei?tournament=${tournamentId}`);
  assert.deepEqual(matchCtaDestination(tournament), { mode: "catalog", key: "tournament", params: { tournamentId } });

  const circuit = buildCircuitCtaHref("circuito-autunno");
  assert.deepEqual(matchCtaDestination(circuit), { mode: "catalog", key: "circuit", params: { slug: "circuito-autunno" } });

  const content = buildPadelleriaCtaHref(contentId);
  assert.deepEqual(matchCtaDestination(content), { mode: "catalog", key: "padelleria_content", params: { contentId } });
});

test("Partner static and specific destinations round-trip safely", () => {
  const href = buildPartnerCtaHref("mase-demo");
  assert.equal(href, "/partner/mase-demo");
  assert.deepEqual(matchCtaDestination(href), { mode: "catalog", key: "partner", params: { slug: "mase-demo" } });
  assert.throws(() => buildPartnerCtaHref("Slug Non Valido"));

  const now = Date.parse("2026-10-03T12:00:00Z");
  const rows = [
    { id: tournamentId, name: "Visibile", slug: "visibile", status: "active", valid_from: "2026-10-01T00:00:00Z", valid_until: "2026-10-04T00:00:00Z" },
    { id: contentId, name: "Bozza", slug: "bozza", status: "draft" },
    { id: "33333333-3333-4333-8333-333333333333", name: "Scaduto", slug: "scaduto", status: "active", valid_until: "2026-10-01T00:00:00Z" },
  ];
  assert.deepEqual(filterPartnerCtaOptions(rows, now).map((item) => item.name), ["Visibile"]);
});

test("external HTTPS is canonicalized and unsafe external URLs are rejected", () => {
  assert.equal(canonicalizeExternalCtaUrl("HTTPS://Example.COM/path"), "https://example.com/path");
  assert.deepEqual(matchCtaDestination("https://example.com/path"), { mode: "external", url: "https://example.com/path" });
  for (const value of ["http://example.com", "https://user:pass@example.com", "javascript:alert(1)", "data:text/plain,test"]) {
    assert.throws(() => canonicalizeExternalCtaUrl(value));
  }
});

test("custom internal routes are validated with the semantic denylist", () => {
  assert.deepEqual(validateCustomInternalPath("/pagina-pubblica?x=1#sezione"), { ok: true });
  assert.deepEqual(matchCtaDestination("/pagina-pubblica?x=1"), { mode: "custom_internal", path: "/pagina-pubblica?x=1" });
  for (const value of ["//evil.test", "/\\evil", "/admin", "/admin/users", "/staff", "/api/items", "/auth/callback", "/dev/public-ui", "/riscatto-premio/token", "/accedi", "/registrati", "/attiva-account", "/accesso-precedente", "/password-dimenticata", "/reset-password", "/x/../admin"]) {
    assert.equal(validateCustomInternalPath(value).ok, false, value);
  }
});

test("legacy and unexpected query strings are preserved rather than destructively matched", () => {
  assert.deepEqual(matchCtaDestination("javascript:legacy()"), { mode: "legacy", rawValue: "javascript:legacy()" });
  const withExtra = `/tornei?tournament=${tournamentId}&source=legacy`;
  assert.deepEqual(matchCtaDestination(withExtra), { mode: "custom_internal", path: withExtra });
});

test("Padelleria self links are rejected", () => {
  assert.throws(() => assertNotPadelleriaSelfLink(contentId, buildPadelleriaCtaHref(contentId)), /se stesso/);
  assert.doesNotThrow(() => assertNotPadelleriaSelfLink(contentId, buildPadelleriaCtaHref(tournamentId)));
});

test("draft circuits and hidden Padelleria content are excluded", () => {
  const circuits = filterCircuitCtaOptions([
    { id: tournamentId, name: "Attivo", slug: "attivo", status: "active" },
    { id: contentId, name: "Bozza", slug: "bozza", status: "draft" },
  ]);
  assert.deepEqual(circuits.map((item) => item.name), ["Attivo"]);

  const now = Date.parse("2026-10-02T12:00:00Z");
  const rows = [
    { id: tournamentId, title: "Visibile", kind: "succede", status: "published", visible_from: "2026-10-01T00:00:00Z", visible_until: "2026-10-03T00:00:00Z" },
    { id: contentId, title: "Scaduto", kind: "succede", status: "published", visible_until: "2026-10-01T00:00:00Z" },
    { id: "33333333-3333-4333-8333-333333333333", title: "Bozza", kind: "succede", status: "draft" },
  ];
  assert.deepEqual(filterPadelleriaCtaOptions(rows, undefined, now).map((item) => item.title), ["Visibile"]);
  assert.deepEqual(filterPadelleriaCtaOptions(rows, tournamentId, now), []);
});

test("old missing targets remain selectable until the operator changes them", () => {
  assert.deepEqual(includePreservedOption([], "old-target", "Destinazione salvata non più disponibile"), [
    { value: "old-target", label: "Destinazione salvata non più disponibile" },
  ]);
});

test("CTA label suggestions never overwrite existing or customized labels", () => {
  assert.equal(shouldApplyCtaLabelSuggestion("", false), true);
  assert.equal(shouldApplyCtaLabelSuggestion("Iscriviti", false), false);
  assert.equal(shouldApplyCtaLabelSuggestion("", true), false);
});

test("Admin editor uses the central catalog and lazy dynamic endpoints", async () => {
  const [editor, fields, route] = await Promise.all([
    readFile(new URL("../src/app/admin/padelleria/ContentEditor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/admin/padelleria/CtaDestinationFields.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/admin/padelleria/[id]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(editor, /<CtaDestinationFields/);
  assert.doesNotMatch(editor, />URL CTA<input/);
  for (const endpoint of ["/api/admin/tournaments", "/api/admin/circuits", "/api/admin/partners?limit=50&offset=0", "/api/admin/padelleria?status=published&limit=50&offset=0"]) assert.ok(fields.includes(endpoint));
  assert.match(fields, /if \(!dynamicKey\) return/);
  assert.match(fields, /Valore CTA legacy conservato/);
  assert.match(route, /assertNotPadelleriaSelfLink/);
});
