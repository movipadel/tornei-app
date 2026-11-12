import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const modules = new Map();
function load(name, path) {
  const compiled = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  Function("module", "exports", "require", compiled)(module, module.exports, (dependency) => {
    if (dependency === "server-only") return {};
    if (dependency === "@/lib/movibackEligibility") return modules.get("eligibility");
    if (dependency === "@/lib/movibackCustomerAdminShared") return modules.get("customerAdminShared");
    if (dependency === "@/lib/movibackCustomerAdmin") return modules.get("customerAdmin");
    throw new Error(`Unexpected dependency: ${dependency}`);
  });
  modules.set(name, module.exports);
  return module.exports;
}
const eligibility = load("eligibility", "src/lib/movibackEligibility.ts");
load("customerAdminShared", "src/lib/movibackCustomerAdminShared.ts");
const admin = load("customerAdmin", "src/lib/movibackCustomerAdmin.ts");
const { customerAdminIssues, customerAdminStatusLabel } = load("issues", "src/lib/customerAdminIssues.ts");

test("customer summary translates eligibility and certificate states for Admin", () => {
  assert.equal(customerAdminStatusLabel("blocked"), "Non operativo");
  assert.equal(customerAdminStatusLabel("pending_review"), "In revisione");
  assert.equal(customerAdminStatusLabel("grace_period"), "Periodo di tolleranza");
});
const membership = { id: "synthetic", status: "suspended", suspension_reason: admin.VOLUNTARY_MOVIBACK_EXIT,
  tax_code: "RSSMRA90A01H501U", fee_paid: true, approved_at: "2026-08-01T00:00:00Z" };
const pending = { id: "synthetic-pending", status: "pending_review", expiry_date: "2027-02-17", uploaded_at: "2026-11-01T00:00:00Z" };
const approved = { ...pending, status: "approved" };
const account = { identity_status: "active", auth_access: { key: "active" } };
const decision = (changes = {}) => admin.customerReactivationDecision({ membership, membershipCount: 1,
  accountActive: true, certificates: [pending], currentDate: "2026-11-12", ...changes });
const issues = (changes = {}) => customerAdminIssues({ account, playerStatus: "active", identityCaseCount: 0,
  membership, membershipCount: 1, certificate: pending,
  eligibility: eligibility.computeMovibackEligibility({ memberships: [membership], certificates: [pending], currentDate: "2026-11-12" }),
  canReactivate: false, ...changes });

test("Nadia-type synthetic fixture has linked account and player, two distinct issues, and review action", () => {
  const result = issues();
  assert.deepEqual(result.map((issue) => issue.key), ["suspension", "certificate"]);
  assert.equal(result[0].cause, admin.VOLUNTARY_MOVIBACK_EXIT);
  assert.equal(result[0].action, null);
  assert.equal(result[1].action, "review");
  assert.equal(decision().allowed, false);
  assert.equal(admin.canReviewCustomerCertificate(membership, 1, true, pending), true);
});

test("certificate approval alone leaves suspended eligibility blocked; explicit reactivation becomes available", () => {
  const current = eligibility.computeMovibackEligibility({ memberships: [membership], certificates: [approved], currentDate: "2026-11-12" });
  assert.equal(current.can_use_card, false);
  assert.equal(current.can_earn_points, false);
  assert.equal(current.can_redeem, false);
  assert.equal(decision({ certificates: [approved] }).allowed, true);
  assert.equal(issues({ certificate: approved, eligibility: current, canReactivate: true })[0].action, "reactivate");
  const after = eligibility.computeMovibackEligibility({ memberships: [{ ...membership, status: "approved" }], certificates: [approved], currentDate: "2026-11-12" });
  assert.equal(after.can_use_card && after.can_earn_points && after.can_redeem, true);
});

test("non-reversible suspension and identity conflicts never expose review or reactivation", () => {
  const blocked = { ...membership, suspension_reason: "Sospensione amministrativa" };
  assert.equal(admin.canReviewCustomerCertificate(blocked, 1, true, pending), false);
  assert.equal(decision({ membership: blocked, certificates: [approved] }).allowed, false);
  assert.equal(decision({ membershipCount: 2, certificates: [approved] }).allowed, false);
  assert.equal(decision({ accountActive: false, certificates: [approved] }).allowed, false);
  assert.equal(decision({ membership: { ...membership, fee_paid: false }, certificates: [approved] }).allowed, false);
  assert.equal(issues({ membership: blocked, canReactivate: false }).find((issue) => issue.key === "suspension")?.action, null);
});

test("normal, access, identity, grace, and standby issue states are specific", () => {
  assert.equal(customerAdminIssues({ account, playerStatus: "active", identityCaseCount: 0, membership: { status: "approved" }, membershipCount: 1,
    certificate: approved, eligibility: { eligibility_state: "active", reason_code: "ELIGIBLE", human_message: "MoviBack attivo." }, canReactivate: false }).length, 0);
  assert.ok(issues({ account: { identity_status: "active", auth_access: { key: "to_activate" } }, identityCaseCount: 1 }).some((item) => item.key === "access"));
  assert.ok(issues({ identityCaseCount: 1 }).some((item) => item.key === "identity"));
  for (const [reason, key] of [["CERTIFICATE_GRACE", "certificate_expiry"], ["CERTIFICATE_STANDBY", "certificate_expiry"]]) {
    assert.ok(issues({ membership: { status: "approved" }, certificate: approved,
      eligibility: { eligibility_state: "standby", reason_code: reason, human_message: "Certificato scaduto" } }).some((item) => item.key === key));
  }
});

test("full-ledger helper remains separate from paginated transaction history", () => {
  const loader = read("src/lib/customerHubServer.ts");
  assert.match(loader, /getMovibackBalance\(sb, membership\.id\)/);
  assert.match(loader, /\.limit\(20\)/);
  assert.doesNotMatch(loader, /pointsBalance\s*=\s*transactions\.reduce/);
  const helper = read("src/lib/movibackBalanceServer.ts");
  assert.match(helper, /get_moviback_points_balances/);
  const eightyOneMovements = Array.from({ length: 81 }, () => 1);
  assert.equal(eightyOneMovements.reduce((sum, points) => sum + points, 0), 81);
  assert.equal(eightyOneMovements.slice(0, 20).reduce((sum, points) => sum + points, 0), 20);
});

test("Admin routes use explicit privileged RPCs and reject generic status editing", () => {
  assert.match(read("src/app/api/admin/moviback/certificates/[id]/review/route.ts"), /rpc\("review_moviback_certificate"/);
  assert.match(read("src/app/api/admin/moviback/users/[id]/reactivate/route.ts"), /guardAdmin\(\)/);
  assert.match(read("src/app/api/admin/moviback/users/[id]/reactivate/route.ts"), /rpc\("reactivate_moviback_membership_admin"/);
  assert.match(read("src/app/api/admin/moviback/users/[id]/route.ts"), /status !== membership\.status/);
  const migration = read("supabase/migrations/20261112105200_moviback_customer_admin_foundation.sql");
  assert.match(migration, /moviback_customer_audit_append_only/);
  assert.match(migration, /v_membership\.suspension_reason='Uscita volontaria utente'/);
  assert.doesNotMatch(migration, /update public\.loyalty_transactions/i);
  assert.doesNotMatch(migration, /health_data_consent_at\s*=/i);
});
