import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { registrationGenderSuggestion } from "../src/lib/tournamentRegistrationGenderSuggestion.ts";
import { tournamentMixedPreparationView } from "../src/lib/tournamentMixedPreparationView.ts";

const read = (path) => readFileSync(path, "utf8");
const ui = read("src/app/admin/tournaments/ui.tsx");
const table = read("src/app/admin/tournaments/[id]/registrations/_components/RegistrationsTable.tsx");
const registrations = read("src/app/api/admin/tournaments/[id]/registrations/route.ts");
const preparation = read("src/app/api/admin/tournaments/[id]/mixed-preparation/route.ts");
const migration = read("supabase/migrations/20261111123038_baraonda_mixed_stage_ranking_destination.sql");
const view = (category, male, female, unknown, eligible, hasRun = false, reason = null) =>
  tournamentMixedPreparationView("Baraonda", category, hasRun, { male_count: male, female_count: female, unknown_count: unknown, eligible, reason }, false);

test("actual Admin tournament card loads and renders mixed preparation before registrations", () => {
  assert.match(ui, /fetch\(`\/api\/admin\/tournaments\/\$\{tournamentId\}\/mixed-preparation`, \{ cache: "no-store" \}\)/);
  assert.ok(ui.indexOf('<section aria-label="Preparazione Misto"') < ui.indexOf('Iscrizioni ({mainRegs.length})'));
  for (const label of ["Uomini:", "Donne:", "Non indicato:", "Classifica:", "Imposta tappa come Misto", "Reimposta come Libero"]) {
    assert.ok(ui.includes(label), `${label} missing`);
  }
  assert.match(ui, /mixedView\.canConvertMisto/);
  assert.match(ui, /mixedView\.canConvertLibero/);
  assert.match(ui, /window\.confirm\(message\)/);
  assert.match(ui, /method: "PATCH"/);
  assert.match(ui, /confirm: true/);
  assert.match(preparation, /\.rpc\("admin_tournament_prepare_mixed"/);
});

test("known canonical gender is suggested only for an unknown snapshot and never written automatically", () => {
  assert.deepEqual(registrationGenderSuggestion(null, "M", "M"), { suggestion: "M", conflict: false });
  assert.deepEqual(registrationGenderSuggestion(null, null, "F"), { suggestion: "F", conflict: false });
  assert.deepEqual(registrationGenderSuggestion("F", "M", "M"), { suggestion: null, conflict: false });
  assert.deepEqual(registrationGenderSuggestion(null, null, null), { suggestion: null, conflict: false });
  assert.deepEqual(registrationGenderSuggestion(null, "M", "F"), { suggestion: null, conflict: true });
  assert.deepEqual(registrationGenderSuggestion(null, "M", "M", true), { suggestion: null, conflict: true });
  assert.match(registrations, /p1_gender_suggestion: p1Gender\.suggestion/);
  assert.match(registrations, /p2_gender_suggestion: p2Gender\.suggestion/);
  assert.match(registrations, /p1_gender_conflict: p1Gender\.conflict/);
  assert.match(table, /Profilo MOVI: \{suggestion\}/);
  assert.match(table, /Imposta genere:/);
  assert.match(table, /onClick=\{\(\) => onGender\(value\)\}/);
});

test("both player slots and reserve rows have explicit gender actions in the actual Admin table", () => {
  const main = ui.split("{mainRegs.map((r, idx) => (")[1]?.split("{reserveRegs.length > 0")[0] ?? "";
  const reserve = ui.split("{reserveRegs.map((r, idx) => (")[1]?.split("</TableBody>")[0] ?? "";
  for (const rows of [main, reserve]) {
    assert.match(rows, /RegistrationGenderActions playerName=\{r\.p1_name\}/);
    assert.match(rows, /RegistrationGenderActions playerName=\{r\.p2_name\}/);
    assert.match(rows, /prepareMixed\(tid, "set_gender", r\.id, "p1", value\)/);
    assert.match(rows, /prepareMixed\(tid, "set_gender", r\.id, "p2", value\)/);
  }
  assert.match(migration, /set p1_gender = p_gender/);
  assert.match(migration, /set p2_gender = p_gender/);
  assert.doesNotMatch(migration, /update public\.(users|player_identities) set gender/i);
});

test("unknown, balanced, and unbalanced counters obey server eligibility", () => {
  assert.deepEqual(view("libero", 0, 0, 8, false), {
    showBlock: true, canEditGender: true, canConvertMisto: false, canConvertLibero: false,
    showUnknownHint: true, showBalanceHint: false,
  });
  assert.equal(view("libero", 4, 4, 0, true).canConvertMisto, true);
  assert.equal(view("libero", 5, 3, 0, false).canConvertMisto, false);
  assert.equal(view("libero", 5, 3, 0, false).showBalanceHint, true);
  assert.equal(view("libero", 4, 4, 0, false).canConvertMisto, false);
  assert.equal(tournamentMixedPreparationView("Coppie fisse", "libero", false, null, false).showBlock, false);
});

test("run or results freeze conversion and existing Misto remains informational", () => {
  assert.equal(view("libero", 4, 4, 0, true, true).showBlock, false);
  assert.equal(view("libero", 4, 4, 0, true, true).canConvertMisto, false);
  assert.equal(view("misto", 4, 4, 0, true, true).showBlock, true);
  assert.equal(view("misto", 4, 4, 0, true, true).canConvertLibero, false);
  assert.equal(view("misto", 4, 4, 0, true).canConvertLibero, true);
  assert.equal(view("libero", 4, 4, 0, false, false, "TAPPA_GIA_CONCLUSA").canEditGender, false);
  assert.match(migration, /reason := 'TAPPA_GIA_CONCLUSA'/);
});

test("ranking destination and unknown-gender run guards remain unchanged", () => {
  assert.match(ui, /mixed\?\.ranking_category/);
  assert.match(ui, /Classifica: \{mixed\.ranking_category/);
  assert.match(migration, /unknown_count > 0 then reason := 'GENERE_NON_INDICATO'/);
  assert.match(read("src/app/api/admin/tournaments/[id]/run/start/route.ts"), /if \(g !== "M" && g !== "F"\) throw/);
  assert.doesNotMatch(ui, /circuit_results|ranking_group_id|materializ/i);
});
