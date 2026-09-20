import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260921130000_monday_league_stage7_notifications.sql", "utf8");
const route = readFileSync("src/app/api/cron/monday-league-notifications/route.ts", "utf8");
const communications = readFileSync("src/app/api/user/communications/route.ts", "utf8");

test("scanner endpoint is bearer-secret protected and server-only", () => {
  assert.match(route, /process\.env\.CRON_SECRET/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /status:\s*401/);
  assert.doesNotMatch(route, /export async function GET/);
  assert.doesNotMatch(route, /recipient_user_id.*body|body.*recipient_user_id/s);
});

test("outbox is locked down and delivery reuses personal communications", () => {
  assert.match(migration, /ALTER TABLE public\.league_notification_events ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.league_notification_events FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT[\s\S]*TO service_role/);
  assert.match(migration, /INSERT INTO public\.communications/);
  assert.match(migration, /ON CONFLICT\(event_key\) WHERE event_key IS NOT NULL DO NOTHING/);
  assert.match(communications, /\.eq\("recipient_user_id", uid\)/);
});

test("reminder scan resolves the current captain and applies sporting guards", () => {
  assert.match(migration, /cp\.id=t\.captain_player_id/);
  assert.match(migration, /s\.status IN \('phase1','phase2'\)/);
  assert.match(migration, /m\.match_status='scheduled'/);
  assert.match(migration, /NOT EXISTS\(SELECT 1 FROM public\.league_lineups/);
  assert.match(migration, /m\.current_result_id IS NULL AND m\.current_special_outcome_id IS NULL/);
});

test("transactional hooks never include contest or admin reasons", () => {
  assert.match(migration, /AFTER INSERT ON public\.league_audit_events/);
  assert.match(migration, /captain_result_submitted/);
  assert.match(migration, /result_contested/);
  assert.match(migration, /contest_corrected/);
  assert.doesNotMatch(migration, /NEW\.reason.*body|resolution_note.*body|correction_reason.*body/s);
});

test("reschedule and reopen events are bilateral and versioned", () => {
  assert.match(migration, /:rescheduled:'\|\|NEW\.schedule_version/);
  assert.match(migration, /OLD\.scheduled_at IS NULL OR NEW\.scheduled_at IS NULL/);
  assert.match(migration, /lineups-reopened:'\|\|NEW\.id/);
  assert.match(migration, /v_match\.scheduled_at-interval '1 hour'/);
});

test("claiming is concurrent-worker safe and retries are bounded", () => {
  assert.match(migration, /FOR UPDATE SKIP LOCKED/);
  assert.match(migration, /attempts<5/);
  assert.match(migration, /locked_at<now\(\)-interval '5 minutes'/);
  assert.match(migration, /CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END/);
});

test("Europe Rome formatting uses the named timezone without fixed offsets", () => {
  assert.match(migration, /AT TIME ZONE 'Europe\/Rome'/);
  assert.doesNotMatch(migration, /UTC[+-]|interval '[12] hours'.*AT TIME ZONE/s);
});

test("captain transports remain local-safe and no parallel messaging stack is introduced", () => {
  assert.doesNotMatch(route, /sendTelegram|sendAdminPush|sendStoreOrderEmail|webPush|Resend/);
  assert.match(migration, /channel text NOT NULL DEFAULT 'in_app'/);
  assert.match(migration, /CHECK \(channel = 'in_app'\)/);
});

test("Phase 2 contract exists but is never invoked by the Stage 7 scanner", () => {
  assert.match(migration, /CREATE FUNCTION public\.league_enqueue_phase2_ready/);
  const scanner = migration.slice(
    migration.indexOf("CREATE FUNCTION public.league_scan_due_notifications"),
    migration.indexOf("CREATE FUNCTION public.league_claim_notification_events")
  );
  assert.doesNotMatch(scanner, /phase2_ready/);
});
