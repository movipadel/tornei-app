import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261112121613_admin_incomplete_activation_email_correction.sql");
const separation = read("../supabase/migrations/20261112143000_account_activation_repair_customer_identity_scope.sql");
const participantLink = read("../supabase/migrations/20261112144500_player_identity_participant_link_source_qualification.sql");
const route = read("../src/app/api/admin/players/[id]/activation-email-correction/route.ts");
const ui = read("../src/app/admin/players/[id]/ActivationEmailCorrection.tsx");
const detail = read("../src/app/admin/players/[id]/PlayerDetail.tsx");
const identityReview = read("../src/components/PlayerIdentityAdmin.tsx");

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

test("account recovery excludes sporting reviews but retains customer ownership guards", () => {
  assert.match(separation, /create or replace function public\.admin_prepare_incomplete_activation_email_repair/);
  assert.match(separation, /c\.source_kind in \('account','account_profile','account_merge','circuit_account'\)/);
  assert.match(separation, /c\.case_type='identity_data_conflict' and c\.source_kind='admin_identity'/);
  assert.doesNotMatch(separation, /v_user\.id=any\(c\.account_ids\) or v_player_id=any\(c\.player_ids\)/);
  assert.match(separation, /user_duplicate_review_groups/);
  assert.match(separation, /account_activation_repair_email_conflict/);
  assert.match(detail, /identityCaseTypes:hub\.open_cases\.map\(item=>item\.case_type\)/);
  assert.match(detail, /issue\.action==='access'\|\|issue\.action==='access_repair'/);
  assert.match(detail, /issue\.action==='identity'/);
});

test("sporting case link requires an Admin reason and refreshes after success", () => {
  assert.match(identityReview, /disabled=\{busy\|\|!reason\.trim\(\)\}/);
  assert.match(identityReview, /Indica il motivo della decisione per abilitare/);
  assert.match(identityReview, /resolve\('confirm',\{player_id:p\.id\}\)/);
  assert.match(identityReview, /await load\(\)/);
  assert.doesNotMatch(identityReview, /activation-email-correction/);
});

test("circuit participant resolver qualifies source phone without changing account ownership", () => {
  assert.match(participantLink, /create or replace function public\.player_identity_command/);
  assert.match(participantLink, /select trp\.name source_name,trp\.phone source_phone into rec from tournament_run_participants trp where trp\.id=/);
  assert.match(participantLink, /if nullif\(btrim\(p_data->>'reason'\),''\) is null then raise exception 'REASON_REQUIRED'/);
  assert.match(participantLink, /insert into player_identity_identifiers/);
  assert.match(participantLink, /update circuit_results set player_identity_id=p\.id/);
  assert.doesNotMatch(participantLink, /update (public\.)?users set|update auth\.users set/i);
});

test("repair audit is append-only and does not edit other business data", () => {
  assert.match(migration, /ACCOUNT_ACTIVATION_EMAIL_CORRECTED/);
  assert.match(migration, /ACCOUNT_ACTIVATION_EMAIL_CORRECTION_CANCELLED/);
  assert.match(migration, /account_activation_email_repair_events_immutable/);
  assert.match(migration, /auth_migration_state='review_required'/);
  assert.match(migration, /auth_migration_state='legacy'/);
  assert.doesNotMatch(migration, /update public\.(player_identities|loyalty_memberships|loyalty_transactions|tournament_registrations)/i);
});
