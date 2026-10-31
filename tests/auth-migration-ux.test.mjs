import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("access entry presents login, existing-profile activation and new registration equally", () => {
  const page = read("src/app/accedi/page.tsx");
  const form = read("src/components/MoviAuthForm.tsx");
  assert.match(page, /mode="login" entryFirst/);
  assert.match(form, /Hai già attivato il nuovo accesso MOVI\?/);
  assert.match(form, /Attiva il tuo profilo/);
  assert.match(form, /Crea un nuovo profilo/);
  assert.match(form, /Il tuo profilo esiste già/);
  assert.match(form, /Non devi registrarti di nuovo/);
  assert.match(form, /I tuoi dati, attività e MoviBack restano disponibili/);
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
