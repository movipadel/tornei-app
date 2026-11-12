import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261112121613_admin_incomplete_activation_email_correction.sql");
const route = read("../src/app/api/admin/players/[id]/activation-email-correction/route.ts");
const ui = read("../src/app/admin/players/[id]/ActivationEmailCorrection.tsx");
const detail = read("../src/app/admin/players/[id]/PlayerDetail.tsx");

test("incomplete activation repair restricts eligibility and target addresses", () => {
  for (const condition of [
    "v_user.identity_status<>'active'", "v_user.auth_user_id is not null",
    "v_user.auth_migration_state<>'activation_pending'", "o.state='pending_verification'",
    "v_count<>1", "v_auth.email_confirmed_at is not null", "v_auth.last_sign_in_at is not null",
    "auth.sessions", "storage.objects", "auth.identities", "player_identity_cases",
    "user_duplicate_review_groups", "a.email_change", "player_identity_email_evidence",
  ]) assert.ok(migration.includes(condition), `Missing safety condition: ${condition}`);
  assert.match(migration, /public\.account_activation_repair_email_conflict\(v_user\.id,v_auth_id,v_new_email\)/);
  assert.match(migration, /public\.users u\s+where u\.id<>p_public_user_id/);
  assert.match(migration, /public\.user_auth_onboarding o\s+where o\.auth_user_id<>p_old_auth_user_id/);
});

test("server route uses prepared operation and Supabase Auth Admin deletion", () => {
  assert.match(route, /guardAdmin\(\)/);
  assert.match(route, /getStaffSessionFromCookie\(\)/);
  assert.match(route, /admin_prepare_incomplete_activation_email_repair/);
  assert.match(route, /admin_incomplete_activation_repair_deletion_ready/);
  assert.match(route, /admin_cancel_incomplete_activation_email_repair/);
  assert.match(route, /sb\.auth\.admin\.deleteUser\(state\.auth_user_id\)/);
  assert.match(route, /admin_finish_incomplete_activation_email_repair/);
  assert.doesNotMatch(route, /auth\.admin\.updateUserById|createUser|email_confirm:\s*true/);
});

test("Customer Hub exposes correction only for incomplete activation", () => {
  assert.match(ui, /Attivazione non completata/);
  assert.match(ui, /Correggi email e riavvia attivazione/);
  assert.match(ui, /Modifica email non disponibile da questo flusso/);
  assert.match(ui, /Usa soltanto un indirizzo verificato direttamente con il cliente/);
  assert.match(ui, /La password scelta in precedenza non sarà più valida/);
  assert.match(ui, /Avvia nuova attivazione/);
  assert.match(ui, /\/attiva-account/);
  assert.match(ui, /repair\.state === "eligible"/);
  assert.match(detail, /<ActivationEmailCorrection/);
});

test("repair audit is append-only and does not edit other business data", () => {
  assert.match(migration, /ACCOUNT_ACTIVATION_EMAIL_CORRECTED/);
  assert.match(migration, /ACCOUNT_ACTIVATION_EMAIL_CORRECTION_CANCELLED/);
  assert.match(migration, /account_activation_email_repair_events_immutable/);
  assert.match(migration, /auth_migration_state='review_required'/);
  assert.match(migration, /auth_migration_state='legacy'/);
  assert.doesNotMatch(migration, /update public\.(player_identities|loyalty_memberships|loyalty_transactions|tournament_registrations)/i);
});
