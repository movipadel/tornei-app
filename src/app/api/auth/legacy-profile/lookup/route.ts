import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { setAccessContext } from "@/lib/accessHelpContext";
import { maskEmail, maskPhone } from "@/lib/privacyMasking";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const fullName = String(body.full_name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  if (!fullName || !phone) return NextResponse.json({ error: "Inserisci nome e telefono" }, { status: 400 });
  const sb = supabaseAdmin();
  const client = createHash("sha256").update(request.headers.get("x-forwarded-for") ?? "local").digest("hex");
  const identity = createHash("sha256").update(`${fullName.toLowerCase()}\u001f${phone}`).digest("hex");
  const { data: limit } = await sb.rpc("consume_legacy_login_rate_limit", {
    p_client_key: client, p_identity_key: identity, p_now: new Date().toISOString(),
  });
  if ((limit as { allowed?: boolean } | null)?.allowed === false) {
    return NextResponse.json({ error: "Troppi tentativi. Riprova piÃ¹ tardi." }, { status: 429 });
  }
  const { data, error } = await sb.rpc("lookup_legacy_profile_for_activation", { p_full_name: fullName, p_phone: phone });
  if (error) return NextResponse.json({ error: "Ricerca non disponibile" }, { status: 500 });
  const result = (data ?? {}) as Record<string, unknown>;
  const state = String(result.state ?? "not_found");
  if (state === "found") {
    const publicUserId = String(result.public_user_id);
    const { data: profile, error: profileError } = await sb.from("users")
      .select("full_name,email,phone").eq("id", publicUserId).single();
    if (profileError || !profile) return NextResponse.json({ error: "Ricerca non disponibile" }, { status: 500 });
    const [{ count: memberships }, { count: tournaments }] = await Promise.all([
      sb.from("loyalty_memberships").select("id", { count: "exact", head: true }).eq("user_id", publicUserId),
      sb.from("tournament_registrations").select("id", { count: "exact", head: true }).eq("user_id", publicUserId),
    ]);
    await setAccessContext({ state: "found", publicUserId,
      normalizedName: String(result.normalized_name), normalizedPhone: String(result.normalized_phone) });
    return NextResponse.json({ state, profile: { full_name: profile.full_name,
      phone: maskPhone(profile.phone), email: maskEmail(profile.email),
      moviback: Boolean(memberships), tournaments: Boolean(tournaments) } });
  }
  if (state === "name_mismatch" || state === "multiple_profiles") {
    await setAccessContext({ state, publicUserId: result.public_user_id ? String(result.public_user_id) : undefined,
      normalizedName: String(result.normalized_name), normalizedPhone: String(result.normalized_phone) });
  }
  return NextResponse.json({ state });
}
