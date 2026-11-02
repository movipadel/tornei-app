import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(path, 'utf8');

test('certificate review has exact targets, expiry guard, and one pending row', () => {
  const bridge = read('supabase/migrations/20261102095000_moviback_certificate_superseded_status.sql');
  const sql = read('supabase/migrations/20261102100000_moviback_certificate_review_hardening.sql');
  assert.match(bridge, /alter table public\.medical_certificates drop constraint medical_status_check/i);
  assert.match(bridge, /alter table public\.medical_certificates add constraint medical_status_check[\s\S]*'superseded'/i);
  assert.doesNotMatch(bridge, /\b(?:update|insert|delete|create unique index|create trigger)\b/i);
  assert.doesNotMatch(sql, /(?:drop|add) constraint medical_status_check/i);
  assert.match(sql, /status='superseded'/);
  assert.match(sql, /create unique index medical_certificates_one_pending_per_user[\s\S]*where status='pending_review'/i);
  assert.match(sql, /create function public\.review_moviback_certificate\([\s\S]*p_membership_id uuid, p_certificate_id uuid/i);
  assert.match(sql, /where id=p_certificate_id for update/);
  assert.match(sql, /v_certificate\.user_id<>v_membership\.user_id/);
  assert.match(sql, /v_certificate\.expiry_date<current_date/);
  assert.match(sql, /CERTIFICATE_EXPIRED_REPLACEMENT_REQUIRED/);
  assert.match(sql, /reviewed_at=v_now, reviewed_by=p_actor_staff_id/);
  assert.match(sql, /review_moviback_membership_c6/);
  assert.match(sql, /revoke all on function public\.review_moviback_membership_c5\([^)]*\) from service_role/);
  const replacement = read('src/app/api/moviback/certificate/replace/route.ts');
  assert.match(replacement, /calendarDaysAfter\(expiryDate, romeCalendarDate\(\)\)/);
  assert.match(replacement, /randomUUID\(\)/);
});

test('certificate release documents the bridge, separate remediation, then hardening', () => {
  const docs = read('docs/rebranding/MOVIBACK_CERTIFICATE_MEDIA_CONSENT_V1.md');
  const ordered = [
    '20261102095000_moviback_certificate_superseded_status.sql',
    '20261102100000_moviback_certificate_review_hardening.sql',
    '20261102110000_moviback_certificate_expiry_notifications.sql',
    '20261102120000_user_media_consent_v1.sql',
    '20261102130000_certificate_email_stale_delivery_guard.sql',
    '20261102135318_harden_media_consent_append_only_privileges.sql',
  ];
  for (let i = 1; i < ordered.length; i++) assert.ok(docs.indexOf(ordered[i - 1]) < docs.indexOf(ordered[i]));
  assert.match(docs, /MULTIPLE_PENDING_USERS = 0/);
  assert.match(docs, /UNIQUE_PENDING_INDEX_SAFE = YES/);
});

test('queue and Customer Hub distinguish membership and certificate review', () => {
  const queue = read('src/app/api/admin/moviback/requests/route.ts');
  assert.match(queue, /queue_kind: "membership_review"/);
  assert.match(queue, /queue_kind: "certificate_review"/);
  assert.match(queue, /if \(membership\.status !== "approved"\) continue/);
  assert.match(queue, /certificate_id: certificate\.id/);
  assert.match(queue, /\.rpc\("review_moviback_certificate"/);
  const customers = read('src/app/api/admin/players/route.ts');
  assert.match(customers, /hasPendingCertificate/);
  assert.match(customers, /item\.moviback_state === "pending_review" \|\| item\.certificate_pending/);
  for (const path of [
    'src/app/admin/players/[id]/PlayerDetail.tsx',
    'src/app/admin/players/account/[id]/AccountOnlyCustomerDetail.tsx',
  ]) {
    const page = read(path);
    assert.match(page, /membership_id/);
    assert.match(page, /certificates\/\$\{(?:certificate|hub\.certificate)\.id\}\/review/);
    assert.match(page, /Certificato scaduto: richiedere un nuovo certificato/);
  }
});

test('expiry events use Rome calendar, durable keys, stale delivery checks and true copy', () => {
  const sql = read('supabase/migrations/20261102110000_moviback_certificate_expiry_notifications.sql');
  for (const milestone of ['expiring_30d', 'expiring_7d', 'grace_started', 'standby_started']) assert.match(sql, new RegExp(milestone));
  assert.match(sql, /at time zone 'Europe\/Rome'/);
  assert.match(sql, /when 30/); assert.match(sql, /when 7/); assert.match(sql, /when -1/); assert.match(sql, /when -61/);
  assert.match(sql, /certificate:'\|\|v_row\.id\|\|':expiry:'\|\|v_row\.expiry_date/);
  const worker = read('src/app/api/cron/user-email-notifications/route.ts');
  assert.match(worker, /certificateEventCurrent\(item\)/);
  assert.match(worker, /daysAfter >= 1 && daysAfter <= 60/);
  assert.match(worker, /daysAfter >= 61/);
  assert.match(worker, /p_status: "skipped"/);
  const email = read('src/lib/userNotificationEmail.ts');
  assert.match(email, /Per 60 giorni di tolleranza tessera, accumulo punti e riscatto premi restano disponibili/);
  assert.match(email, /L'accumulo punti è sospeso/);
  assert.match(email, /authRedirect\("\/moviback"\)/);
  assert.match(read('.github/workflows/moviback-certificate-expiry.yml'), /MOVIBACK_CERTIFICATE_EXPIRY_ENABLED/);
});

test('media consent remains optional, adult-only, append-only and merge-aware', () => {
  const sql = read('supabase/migrations/20261102120000_user_media_consent_v1.sql');
  assert.match(sql, /create table public\.user_media_consent_events/);
  assert.match(sql, /check \(status in \('granted','not_granted','revoked'\)\)/);
  assert.match(sql, /before update or delete on public\.user_media_consent_events/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.user_media_consent_events from public,anon,authenticated/);
  assert.match(sql, /MEDIA_CONSENT_ADULT_CONFIRMATION_REQUIRED/);
  assert.match(sql, /MEDIA_CONSENT_EVIDENCE_REQUIRED/);
  assert.match(sql, /with recursive lineage/);
  assert.match(sql, /'media_consent',\(select count\(\*\) from public\.user_media_consent_events/);
  const signup = read('src/components/MoviAuthForm.tsx');
  assert.match(signup, /media_consent/);
  assert.match(signup, /type="checkbox"/);
  assert.match(read('src/lib/resolveAuthOnboarding.ts'), /consumeMediaConsentIntentIfAvailable/);
  assert.match(read('src/lib/mediaConsentCompatibility.ts'), /\.rpc\("consume_user_media_signup_intent"/);
  assert.match(read('src/app/api/user/media-consent/route.ts'), /getCurrentMoviUser/);
  assert.match(read('src/app/api/admin/users/[id]/media-consent/route.ts'), /body\.confirmed !== true/);
  assert.match(read('src/app/admin/players/page.tsx'), /Media/);
});

test('media consent event history keeps direct service access read-only', () => {
  const sql = read('supabase/migrations/20261102135318_harden_media_consent_append_only_privileges.sql');
  assert.match(sql, /revoke all on table public\.user_media_consent_events from service_role/i);
  assert.match(sql, /grant select on table public\.user_media_consent_events to service_role/i);
  assert.doesNotMatch(sql, /grant\s+(?:insert|update|delete|truncate)\b/i);
  const consent = read('supabase/migrations/20261102120000_user_media_consent_v1.sql');
  assert.match(consent, /create function public\.record_user_media_consent\([\s\S]*security definer/i);
  assert.match(consent, /create view public\.user_media_consent_current with \(security_invoker=true\)/i);
});
