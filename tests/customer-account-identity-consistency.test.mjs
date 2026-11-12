import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function load(path, dependencies = {}) {
  const compiled = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  Function("module", "exports", "require", compiled)(module, module.exports, (name) => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  });
  return module.exports;
}
const { classifyAccountIdentityConsistency: classify } = load("src/lib/customerAccountIdentityConsistency.ts");
const { customerAdminIssues } = load("src/lib/customerAdminIssues.ts", {
  "@/lib/movibackCustomerAdminShared": { canReviewCustomerCertificate: () => false, VOLUNTARY_MOVIBACK_EXIT: "Uscita volontaria utente" },
});

const canonical = "+393471112233";
const base = {
  account: { full_name: "Mario Rossi", phone: "3471112233", gender: "M" },
  player: { full_name: "Mario Rossi", phone: canonical, gender: "M" },
  accountPhoneE164: canonical,
  playerPhoneE164: canonical,
};
const compare = (changes = {}) => classify({ ...base, ...changes });

test("national, +39, and 0039 phone representations are consistent after canonical DB normalization", () => {
  assert.deepEqual(compare(), { severity: "CONSISTENT", findings: [] });
  assert.deepEqual(compare({ account: { ...base.account, phone: "00393471112233" } }), { severity: "CONSISTENT", findings: [] });
});

test("name comparison ignores case and whitespace, not spelling, accents, or order", () => {
  assert.equal(compare({ account: { ...base.account, full_name: "  MARIO   ROSSI  " } }).severity, "CONSISTENT");
  for (const full_name of ["Marco Rossi", "Mario Rossì", "Rossi Mario"]) {
    const result = compare({ account: { ...base.account, full_name } });
    assert.equal(result.severity, "CONFLICT");
    assert.match(result.findings[0].message, /Nome account/);
  }
});

test("missing account or identity phone is information, not a conflict", () => {
  assert.equal(compare({ account: { ...base.account, phone: null }, accountPhoneE164: null }).severity, "MISSING_DATA");
  assert.equal(compare({ player: { ...base.player, phone: null }, playerPhoneE164: null }).severity, "MISSING_DATA");
});

test("two different canonical phone numbers are a real field-level conflict", () => {
  const result = compare({ account: { ...base.account, phone: "3471112234" }, accountPhoneE164: "+393471112234" });
  assert.equal(result.severity, "CONFLICT");
  assert.deepEqual(result.findings.map(({ field, kind }) => [field, kind]), [["phone", "conflict"]]);
  assert.match(result.findings[0].message, /Telefono account e telefono identità sportiva/);
});

test("missing gender is information; two known different genders conflict", () => {
  assert.equal(compare({ account: { ...base.account, gender: null } }).severity, "MISSING_DATA");
  const result = compare({ player: { ...base.player, gender: "F" } });
  assert.equal(result.severity, "CONFLICT");
  assert.match(result.findings[0].message, /genere presente nei due profili/);
});

test("invalid nonempty phone needs review rather than a fabricated match or conflict", () => {
  const result = compare({ account: { ...base.account, phone: "40" }, accountPhoneE164: null });
  assert.equal(result.severity, "REVIEW_RECOMMENDED");
  assert.equal(result.findings[0].kind, "review");
  assert.equal(compare({ account: { ...base.account, phone: "39 347 1112233" }, accountPhoneE164: null }).severity, "REVIEW_RECOMMENDED");
});

test("real conflicts enter Problems; format-only changes do not", () => {
  const issuesFor = (consistency) => customerAdminIssues({
    account: { identity_status: "active", auth_access: { key: "active" } },
    playerStatus: "active", identityCaseCount: 0, membership: null, membershipCount: 0,
    certificate: null, eligibility: null, canReactivate: false, accountIdentityConsistency: consistency,
  });
  assert.deepEqual(issuesFor(compare()), []);
  const conflict = compare({ account: { ...base.account, phone: "3471112234" }, accountPhoneE164: "+393471112234" });
  assert.equal(issuesFor(conflict)[0].key, "account_identity_conflict");
  assert.match(issuesFor(conflict)[0].cause, /Telefono account/);
  assert.deepEqual(issuesFor(compare({ account: { ...base.account, gender: null } })), []);
});

test("Customer Hub obtains both phones from the canonical DB function and displays severity-specific copy", () => {
  const route = read("src/app/api/admin/players/[id]/customer/route.ts");
  assert.equal((route.match(/sb\.rpc\("normalize_user_mobile_e164"/g) ?? []).length, 2);
  assert.doesNotMatch(route, /account\.phone\.replace\(\/\\D\/g/);
  const view = read("src/app/admin/players/[id]/PlayerDetail.tsx");
  assert.match(view, /accountIdentityConsistency:consistency/);
  assert.match(view, /Dati da completare/);
  assert.match(view, /Verifica anagrafica consigliata/);
  assert.doesNotMatch(view, /I dati account e sportivi non coincidono/);
});
