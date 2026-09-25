import { NextResponse } from "next/server";
import { accessRequestKey, getAccessContext } from "@/lib/accessHelpContext";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = await getAccessContext();
  if (!context) return NextResponse.json({ error: "Ricerca scaduta. Ripeti la ricerca." }, { status: 409 });
  const body = await request.json().catch(() => ({}));
  const requested = String(body.kind ?? "");
  const kind = context.state === "found" && requested === "email_inaccessible" ? "email_inaccessible"
    : context.state === "name_mismatch" ? "name_mismatch"
      : context.state === "multiple_profiles" ? "multiple_profiles" : null;
  if (!kind) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  const { data, error } = await supabaseAdmin().rpc("create_user_access_help_request", {
    p_request_key: accessRequestKey(context, kind), p_kind: kind,
    p_public_user_id: context.publicUserId ?? null, p_duplicate_group_id: null,
    p_submitted_name_normalized: context.publicUserId ? null : context.normalizedName ?? null,
    p_submitted_phone_normalized: context.publicUserId ? null : context.normalizedPhone ?? null,
  });
  if (error) return NextResponse.json({ error: "Non Ã¨ stato possibile inviare la richiesta" }, { status: 500 });
  return NextResponse.json({ ok: true, status: (data as { status?: string } | null)?.status ?? "open" });
}
