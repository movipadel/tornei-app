import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("access entry distinguishes password login, existing-profile activation and new registration", () => {
  const page = read("src/app/accedi/page.tsx");
  const form = read("src/components/MoviAuthForm.tsx");
  const entry = form.split('if (mode === "login" && !loginChosen) {')[1].split('if (sent) {')[0];
  assert.match(page, /mode="login" entryFirst/);
  assert.match(entry, /Hai già una password MOVI\?/);
  assert.match(entry, /Accedi con email e password\./);
  assert.match(entry, /Hai già usato MOVI ma non hai mai creato una password\?/);
  assert.match(entry, /Il tuo profilo esiste già\. Conferma i tuoi dati e scegli la password/);
  assert.match(entry, /href="\/attiva-account" style=\{entryLinkStyle\}>Crea la tua password MOVI/);
  assert.match(entry, /È la prima volta che usi MOVI\?/);
  assert.match(entry, /Crea il tuo profilo personale\./);
  assert.match(entry, /href="\/registrati" style=\{entryLinkSecondaryStyle\}>Crea un nuovo profilo/);
  assert.equal((entry.match(/<section style=\{entryPrimaryStyle\}>/g) ?? []).length, 2);
  assert.equal((entry.match(/<section style=\{entryCardStyle\}>/g) ?? []).length, 1);
  assert.doesNotMatch(entry, /legacy|Auth|attivazione|migrazione|activation_pending/i);
  const activation = read("src/components/LegacyProfileActivation.tsx");
  assert.match(activation, /<h1 style=\{title\}>Crea la tua password MOVI<\/h1>/);
  assert.match(activation, /Il tuo profilo esiste già/);
  assert.match(activation, /Non devi registrarti di nuovo/);
  assert.match(activation, /Conferma i tuoi dati e scegli la password/);
  assert.match(activation, /onSubmit=\{lookup\}/);
  assert.match(activation, /onSubmit=\{activate\}/);
});

test("legacy reminder is limited to activation-available sessions and dismisses per session", () => {
  const prompt = read("src/components/ProgressiveAuthPrompt.tsx");
  const me = read("src/app/api/user/me/route.ts");
  assert.match(prompt, /window\.sessionStorage\.setItem\(DISMISS_KEY, "1"\)/);
  assert.doesNotMatch(prompt, /localStorage/);
  assert.match(prompt, /if \(!migration\?\.activation_available/);
  assert.match(prompt, /Lo farò più tardi/);
  assert.match(prompt, /Attiva ora il mio profilo/);
  assert.match(me, /state === "legacy" \|\| state === "activation_pending"/);
  assert.match(me, /review_required[\s\S]*?activation_available: false/);
  assert.match(me, /conflict[\s\S]*?activation_available: false/);
});

test("verified legacy compatibility remains routed to the certified completion flow", () => {
  const page = read("src/app/attiva-account/page.tsx");
  const form = read("src/components/MoviAuthForm.tsx");
  assert.match(page, /verified === "1"/);
  assert.match(page, /<MoviAuthForm mode="activate"/);
  assert.match(form, /\/api\/auth\/activation\/complete/);
  assert.match(form, /Compatibility only/);
});
