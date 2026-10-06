import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { renderUserNotificationEmail, resolveUserNotificationEmail, sendUserTransactionalEmail, userEmailDestinationFingerprint, type UserNotificationEvent } from "@/lib/userNotificationEmail";
import { userEmailFailureDecision } from "@/lib/userNotificationPolicy";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Claimed = UserNotificationEvent & { delivery_id: string; event_id: string; recipient_user_id: string; attempts: number };

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const value = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !value) return false;
  const expected = Buffer.from(secret), actual = Buffer.from(value);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "USER_EMAIL_UNKNOWN";
  if (message.includes("DESTINATION_UNAVAILABLE") || message.includes("TEMPLATE_UNSUPPORTED")) return { code: message, permanent: true };
  if (message.includes("LOCAL_EMAIL_") || message.includes("NOT_CONFIGURED") || message.includes("CONFIG_MISSING") || message.includes("FINGERPRINT_SECRET")) return { code: message, permanent: true };
  return { code: message.startsWith("USER_EMAIL_PROVIDER:") ? "provider_error" : "delivery_error", permanent: false };
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = supabaseAdmin(), worker = crypto.randomUUID();
  const { data, error } = await sb.rpc("claim_notification_deliveries", { p_worker_id: worker, p_limit: 25 });
  if (error) return NextResponse.json({ error: "Notification claim failed" }, { status: 500 });
  let delivered = 0, retry = 0, failed = 0;
  for (const item of (data ?? []) as Claimed[]) {
    let fingerprint: string | null = null;
    try {
      const email = await resolveUserNotificationEmail(item.recipient_user_id);
      fingerprint = userEmailDestinationFingerprint(email);
      const content = renderUserNotificationEmail(item);
      const result = await sendUserTransactionalEmail({ to: email, ...content });
      const finish = await sb.rpc("finish_notification_delivery", { p_delivery_id: item.delivery_id, p_worker_id: worker, p_status: "delivered", p_provider_message_id: result.id, p_destination_fingerprint: fingerprint });
      if (finish.error) throw finish.error;
      delivered += 1;
    } catch (cause) {
      const classified = errorCode(cause), decision = userEmailFailureDecision(item.attempts, classified.permanent);
      await sb.rpc("finish_notification_delivery", { p_delivery_id: item.delivery_id, p_worker_id: worker, p_status: decision.status, p_destination_fingerprint: fingerprint, p_error_code: classified.code.slice(0, 120), p_error_message: "User email delivery failed", p_next_attempt_at: decision.nextAttemptAt });
      if (decision.status === "failed") failed += 1;
      else retry += 1;
    }
  }
  return NextResponse.json({ ok: true, claimed: (data ?? []).length, delivered, retry, failed });
}
