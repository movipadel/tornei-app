import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../migrations/20261028100000_moviback_corporate_conventions_notifications.sql", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../../src/lib/userNotificationEmail.ts", import.meta.url), "utf8");
const worker = readFileSync(new URL("../../src/app/api/cron/user-email-notifications/route.ts", import.meta.url), "utf8");

test("C7 uses the existing durable email outbox from authoritative audit transitions", () => {
  assert.match(migration, /after insert on public\.moviback_agreement_audit_events/i);
  assert.match(migration, /public\.enqueue_user_notification\(/i);
  assert.match(migration, /public\.resolve_canonical_user_id\(v_membership\.user_id\)/i);
  assert.doesNotMatch(migration, /resend|telegram|expiring|agreement\.expired/i);
});

test("C7 maps only approved activation, non-activation and effective revoke outcomes", () => {
  for (const event of ["moviback.agreement.activated", "moviback.agreement.not_activated", "moviback.agreement.revoked"]) {
    assert.match(migration, new RegExp(event.replaceAll(".", "\\.")));
    assert.match(renderer, new RegExp(event.replaceAll(".", "\\.")));
  }
  assert.match(migration, /entitlement_activated_on_membership_approval/);
  assert.match(migration, /entitlement_not_activated_on_membership_approval/);
  assert.match(migration, /before_state->>'status' = 'active'/);
  assert.match(migration, /v_event_type\|\|':entitlement:'\|\|v_entitlement\.id/);
});

test("templates communicate non-retroactivity and preserve the shared worker", () => {
  assert.match(renderer, /punti già maturati non sono stati modificati/);
  assert.match(renderer, /membership MoviBack resta attiva/);
  assert.match(renderer, /un’altra promozione valida/);
  assert.match(renderer, /Nessun moltiplicatore è attivo/);
  assert.match(renderer, /Convenzione.*Moltiplicatore.*Attiva dal/s);
  assert.match(worker, /renderUserNotificationEmail\(item\)/);
  assert.match(worker, /userEmailFailureDecision/);
});
