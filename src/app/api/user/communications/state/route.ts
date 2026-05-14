import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const uid = await getUserIdFromCookie();

  if (!uid) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const action = String(body.action ?? "");
  const communicationId = String(body.communication_id ?? "").trim();
  const communicationIds = Array.isArray(body.communication_ids)
    ? body.communication_ids.map((x: unknown) => String(x).trim()).filter(Boolean)
    : [];

  const sb = supabaseAdmin();
  const now = new Date().toISOString();

  if (action === "read") {
    if (!communicationId) {
      return NextResponse.json({ error: "communication_id mancante" }, { status: 400 });
    }

    const { error } = await sb.from("communication_user_states").upsert(
      {
        user_id: uid,
        communication_id: communicationId,
        read_at: now,
        dismissed_at: null,
      },
      { onConflict: "user_id,communication_id" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "dismiss") {
    if (!communicationId) {
      return NextResponse.json({ error: "communication_id mancante" }, { status: 400 });
    }

    const { error } = await sb.from("communication_user_states").upsert(
      {
        user_id: uid,
        communication_id: communicationId,
        dismissed_at: now,
      },
      { onConflict: "user_id,communication_id" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "read_all") {
    if (communicationIds.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const rows = (communicationIds as string[]).map((id: string) => ({
      user_id: uid,
      communication_id: id,
      read_at: now,
      dismissed_at: null,
    }));

    const { error } = await sb
      .from("communication_user_states")
      .upsert(rows, { onConflict: "user_id,communication_id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
}