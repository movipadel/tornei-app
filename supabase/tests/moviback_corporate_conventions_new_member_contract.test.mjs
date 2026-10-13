import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../migrations/20261026100000_moviback_corporate_conventions_new_member.sql");
const enrollment = read("../../src/app/api/moviback/request-membership/route.ts");
const review = read("../../src/app/api/admin/moviback/requests/route.ts");
const me = read("../../src/app/api/moviback/me/route.ts");
const publicUi = read("../../src/app/moviback/page.tsx");
const adminUi = read("../../src/app/admin/moviback/requests/page.tsx");
const c4Migration = read("../migrations/20261025100000_moviback_corporate_conventions_self_service.sql");

test("C5 schema has explicit pending and never-active states", () => {
  assert.match(migration, /status IN \('pending','scheduled','active','not_activated','revoked','expired'\)/);
  assert.match(migration, /status = 'pending' AND activated_at IS NULL AND effective_from IS NULL/);
  assert.match(migration, /status = 'not_activated' AND activated_at IS NULL AND effective_from IS NULL/);
  assert.match(migration, /status IN \('available','reserved','claimed','used','closed','revoked','expired'\)/);
});

test("enrollment is identity-bound, hash-only, rate-limited and idempotent", () => {
  assert.match(enrollment, /getUserIdFromCookie/);
  assert.match(enrollment, /hashMovibackAgreementCode/);
  assert.match(enrollment, /movibackEnrollmentRateLimitKeys/);
  assert.match(enrollment, /p_idempotency_key/);
  assert.doesNotMatch(enrollment, /form\.get\("(?:membership_id|agreement_id|entitlement_id|user_id|multiplier)"\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /code_reserved/);
  assert.match(migration, /entitlement_pending_created/);
  assert.doesNotMatch(migration, /INSERT INTO public\.moviback_agreement_codes[^;]*code_hash[^;]*p_code_hash/s);
});

test("approval keeps membership primary and convention outcome atomic", () => {
  assert.match(review, /review_moviback_membership_c5/);
  assert.match(migration, /status='approved'.*approved_at=v_now/s);
  assert.match(migration, /entitlement_activated_on_membership_approval/);
  assert.match(migration, /entitlement_not_activated_on_membership_approval/);
  assert.match(migration, /agreement_suspended/);
  assert.match(migration, /code_revoked/);
  assert.match(migration, /code_expired/);
  assert.match(migration, /status='closed'/);
});

test("public and Admin responses expose safe convention state only", () => {
  assert.match(me, /agreement_state/);
  assert.doesNotMatch(me, /code_hash|code_suffix/);
  assert.match(publicUi, /Convenzione in attesa/);
  assert.match(publicUi, /Convenzione non attivata/);
  assert.match(adminUi, /Convenzione riservata/);
  assert.match(adminUi, /code_suffix/);
});

test("optional enrollment field preserves the responsive form contract", () => {
  assert.match(publicUi, /maxWidth: 520/);
  assert.match(publicUi, /width: "100%"/);
  assert.match(publicUi, /padding: 14/);
  assert.match(publicUi, /minHeight: 46/);
  assert.match(publicUi, /Codice convenzione/);
  assert.match(publicUi, /facoltativo/);
  assert.doesNotMatch(publicUi, /minWidth:\s*[3-9][0-9]{2}/);
});

test("C4 claim RPC remains present and independent", () => {
  assert.match(c4Migration, /claim_moviback_agreement_code/);
  assert.match(c4Migration, /status = 'used'/);
  assert.match(c4Migration, /entitlement_activated/);
});
