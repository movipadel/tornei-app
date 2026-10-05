import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public tokens remain scoped and use the approved palette", async () => {
  const css = await read("src/components/public/PublicUI.module.css");
  for (const color of ["#070d1c", "#101a2f", "#182540", "#111d34", "#1010ff", "#2525ff", "#67dfff", "#d76abb", "#542348", "#f7f9ff", "#b6c4dc", "#2c3a55", "#7185a7", "#74e3ad", "#ffd180", "#ff9daa"]) assert.match(css, new RegExp(color));
  assert.match(css, /^\.root \{/m);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("shell excludes privileged and full-screen flows", async () => {
  const shell = await read("src/components/public/PublicShell.tsx");
  for (const route of ["/admin/", "/staff/", "/accedi", "/registrati", "/attiva-account", "/accesso-precedente", "/password-dimenticata", "/reset-password", "/riscatto-premio/"]) assert.ok(shell.includes(route), `missing shell exception ${route}`);
  assert.match(shell, /<PublicBottomNav/);
  assert.match(shell, /<PublicHeader/);
});

test("bottom navigation links activities and preserves the other destinations and QR payload", async () => {
  const nav = await read("src/components/public/PublicBottomNav.tsx");
  const labels = [...nav.matchAll(/label="(Home|Tornei|Le mie attività|Profilo)"|<span>QR<\/span>/g)].map((match) => match[1] ?? "QR");
  assert.deepEqual(labels, ["Home", "Tornei", "QR", "Le mie attività", "Profilo"]);
  assert.match(nav, /const isActivities = pathname\.startsWith\("\/le-mie-attivita"\)/);
  assert.match(nav, /href="\/le-mie-attivita" label="Le mie attività" active=\{isActivities\}/);
  assert.doesNotMatch(nav, /<NavLink href="\/?#?circuiti/);
  assert.doesNotMatch(nav, /const isCircuits =/);
  for (const destination of ['href="/"', 'href="/tornei"', 'href="/profilo"']) assert.ok(nav.includes(destination));
  assert.match(nav, /`mb:\$\{qr\.code\}`/);
  assert.match(nav, /trigger={<button[^>]+aria-haspopup="dialog"/);
});

test("controlled showcase modal keeps a Radix trigger for focus return", async () => {
  const showcase = await read("src/components/public/PublicUIShowcase.tsx");
  assert.match(showcase, /trigger={<PublicButton>Apri modal demo<\/PublicButton>}/);
});

test("PWA API caching and legacy api-cache purge remain unchanged", async () => {
  const [config, worker] = await Promise.all([read("next.config.ts"), read("worker/index.ts")]);
  assert.match(config, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(config, /handler: "NetworkOnly"/);
  assert.match(config, /method: "GET"/);
  assert.match(worker, /caches\.delete\("apis"\)/);
});

test("showcase is development-only and uses demo QR data", async () => {
  const [page, shell, nav] = await Promise.all([read("src/app/dev/public-ui/page.tsx"), read("src/components/public/PublicShell.tsx"), read("src/components/public/PublicBottomNav.tsx")]);
  assert.match(page, /NODE_ENV === "production"/);
  assert.match(page, /notFound\(\)/);
  assert.match(shell, /pathname === "\/dev\/public-ui"/);
  assert.match(nav, /DEMO LOCALE/);
});
