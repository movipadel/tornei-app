import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { getStaffSessionFromCookie } from "@/lib/staffSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non consentita" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason ?? "").trim();
  if (!id || reason.length < 8 || reason.length > 500) return NextResponse.json({ error: "Conferma il rientro richiesto dal cliente (8–500 caratteri)" }, { status: 400 });
  const session = await getStaffSessionFromCookie();
  if (!session) return NextResponse.json({ error: "Sessione Admin non disponibile" }, { status: 401 });
  const { data, error } = await supabaseAdmin().rpc("reactivate_moviback_membership_admin", {
    p_membership_id: id, p_actor_staff_id: session.sid, p_reason: reason,
  });
  if (error?.code === "PGRST202") return NextResponse.json({ error: "Riattivazione disponibile dopo l’aggiornamento del database" }, { status: 503 });
  if (error) return NextResponse.json({ error: "Riattivazione non disponibile" }, { status: 500 });
  if (!data?.ok) return NextResponse.json({ error: "Prerequisiti di riattivazione non soddisfatti", code: data?.error_code }, { status: 409 });
  return NextResponse.json({ ok: true, data });
}
