import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => null);

  const endpoint = String(body?.endpoint ?? "").trim();
  const p256dh = String(body?.keys?.p256dh ?? "").trim();
  const auth = String(body?.keys?.auth ?? "").trim();

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "Subscription push non valida" },
      { status: 400 }
    );
  }

  const userAgent = req.headers.get("user-agent");

  const sb = supabaseAdmin();

  const { error } = await sb
    .from("admin_push_subscriptions")
    .upsert(
      {
        endpoint,
        p256dh,
        auth,
        user_agent: userAgent,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "endpoint",
      }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}