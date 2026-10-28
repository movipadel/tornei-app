import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ADMIN_THEME_STORAGE_KEY,
  normalizeAdminTheme,
  resolveAdminTheme,
} from "../../src/lib/adminTheme.ts";

test("Admin theme accepts only the three supported modes", () => {
  assert.equal(normalizeAdminTheme("light"), "light");
  assert.equal(normalizeAdminTheme("dark"), "dark");
  assert.equal(normalizeAdminTheme("system"), "system");
  assert.equal(normalizeAdminTheme("sepia"), "system");
  assert.equal(normalizeAdminTheme(null), "system");
});

test("system follows the OS while manual modes override it", () => {
  assert.equal(resolveAdminTheme("system", false), "light");
  assert.equal(resolveAdminTheme("system", true), "dark");
  assert.equal(resolveAdminTheme("light", true), "light");
  assert.equal(resolveAdminTheme("dark", false), "dark");
});

test("theme persistence and styling remain scoped to Admin", async () => {
  assert.equal(ADMIN_THEME_STORAGE_KEY, "movi-admin-theme-v1");
  const [selector, layout, styles] = await Promise.all([
    readFile(new URL("../../src/components/admin/AdminThemeSelector.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/app/admin/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/app/admin/admin-ui.css", import.meta.url), "utf8"),
  ]);
  assert.match(selector, /window\.localStorage\.setItem\(ADMIN_THEME_STORAGE_KEY, nextMode\)/);
  assert.match(selector, /addEventListener\("change", handleSystemChange\)/);
  assert.match(layout, /movi-admin-theme-v1/);
  assert.match(styles, /^\.admin-ui/m);
  assert.match(styles, /@media\(max-width:640px\)\{\.admin-topbar\{padding-top:env\(safe-area-inset-top\)\}/);
  assert.doesNotMatch(styles, /(^|\n)(html|body)\s*\{/);
});

test("specialist compatibility covers browser-normalized legacy colors", async () => {
  const [styles, players] = await Promise.all([
    readFile(new URL("../../src/app/admin/admin-ui.css", import.meta.url), "utf8"),
    readFile(new URL("../../src/app/admin/players/players.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(styles, /\.admin-specialist-page/);
  assert.match(styles, /rgba\(255, 255, 255/);
  assert.match(styles, /\.admin-monday-page/);
  assert.match(styles, /\.admin-orders-segments/);
  assert.match(styles, /data-admin-area="competition"[^\n]*--admin-on-accent:#fff/);
  assert.match(styles, /\.admin-tournament-generate-button:disabled\{color:#fde047!important\}/);
  assert.match(styles, /--admin-section-canvas:linear-gradient\(180deg,#030712/);
  assert.match(styles, /--admin-section-canvas:var\(--admin-bg\)/);
  assert.doesNotMatch(styles, /\.admin-specialist-page\[style\*="linear-gradient/);
  assert.match(styles, /\.admin-moviback-page[^\n]*--admin-success-text/);
  assert.match(styles, /data-admin-theme="dark"[^\n]*\.admin-circuit-dialog/);
  assert.match(styles, /\.admin-circuit-dialog\[data-admin-theme="dark"\]/);
  assert.match(players, /admin-ui\[data-admin-theme="light"\]/);
});

test("all corrected specialist sections opt into the scoped compatibility layer", async () => {
  const files = [
    "../../src/app/admin/comunicazioni/page.tsx",
    "../../src/app/admin/circuits/page.tsx",
    "../../src/app/admin/circuits/[id]/page.tsx",
    "../../src/app/admin/monday-league/page.tsx",
    "../../src/app/admin/moviback/page.tsx",
    "../../src/app/admin/moviback/requests/page.tsx",
    "../../src/app/admin/moviback/catalog/page.tsx",
    "../../src/app/admin/moviback/promos/page.tsx",
    "../../src/app/admin/moviback/users/page.tsx",
    "../../src/app/admin/moviback/users/[id]/page.tsx",
    "../../src/components/moviback/RewardRequestsQueue.tsx",
    "../../src/app/admin/store/products/page.tsx",
    "../../src/app/admin/store/economica/page.tsx",
    "../../src/app/admin/store-economics/page.tsx",
    "../../src/app/admin/store-orders/page.tsx",
  ];
  const sources = await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), "utf8")));
  for (const [index, source] of sources.entries()) {
    assert.match(source, /admin-specialist-page/, files[index]);
  }
});

test("Circuits and MoviBack full-page roots use the shared theme canvas token", async () => {
  const files = [
    "../../src/app/admin/circuits/page.tsx",
    "../../src/app/admin/moviback/page.tsx",
    "../../src/app/admin/moviback/requests/page.tsx",
    "../../src/app/admin/moviback/catalog/page.tsx",
    "../../src/app/admin/moviback/promos/page.tsx",
    "../../src/app/admin/moviback/users/page.tsx",
    "../../src/app/admin/moviback/users/[id]/page.tsx",
    "../../src/components/moviback/RewardRequestsQueue.tsx",
  ];
  const sources = await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), "utf8")));
  for (const [index, source] of sources.entries()) {
    assert.match(source, /background: "var\(--admin-section-canvas\)"/, files[index]);
    assert.doesNotMatch(source, /background: "linear-gradient\(180deg, #030712/, files[index]);
  }
});
