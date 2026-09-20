import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClaimedEvent = { id: string };

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const value = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !value) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(value);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const workerId = crypto.randomUUID();
  const { data: scan, error: scanError } = await sb.rpc(
    "league_scan_due_notifications",
    { p_now: new Date().toISOString(), p_limit: 100 }
  );
  if (scanError) {
    return NextResponse.json({ error: scanError.message }, { status: 500 });
  }

  const { data, error: claimError } = await sb.rpc(
    "league_claim_notification_events",
    { p_worker_id: workerId, p_limit: 50 }
  );
  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  let delivered = 0;
  let skipped = 0;
  let failed = 0;
  for (const event of (data ?? []) as ClaimedEvent[]) {
    const { data: result, error } = await sb.rpc(
      "league_deliver_notification_event",
      { p_event_id: event.id, p_worker_id: workerId }
    );
    if (error) {
      failed += 1;
      await sb.rpc("league_fail_notification_event", {
        p_event_id: event.id,
        p_worker_id: workerId,
        p_error: error.message,
      });
    } else if ((result as { skipped?: boolean } | null)?.skipped) {
      skipped += 1;
    } else {
      delivered += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    scan,
    claimed: (data ?? []).length,
    delivered,
    skipped,
    failed,
  });
}
