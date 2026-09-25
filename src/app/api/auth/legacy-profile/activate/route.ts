import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/accessHelpContext";
import { authRedirect, normalizeEmail, validPassword, genericEmailMessage } from "@/lib/authFlow";
import { findAuthUserByEmail } from "@/lib/authUserLookup";
import { sendPreHotfixActivationEmail } from "@/lib/preHotfixActivation";
import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = await getAccessContext();
  const body = await request.json().catch(() => ({}));
  if (!context?.publicUserId || context.state !== "found") return NextResponse.json({ error: "Ricerca scaduta. Ripeti la ricerca." }, { status: 409 });
  if (!validPassword(body.password) || body.password !== body.password_confirm) return NextResponse.json({ error: "Le password non sono valide" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: check } = await sb.rpc("lookup_legacy_profile_for_activation", {
    p_full_name: context.normalizedName, p_phone: context.normalizedPhone,
  });
  const current = (check ?? {}) as Record<string, unknown>;
  if (current.state !== "found" || current.public_user_id !== context.publicUserId) return NextResponse.json({ error: "Il profilo richiede assistenza" }, { status: 409 });
  const { data: profile } = await sb.from("users").select("email").eq("id", context.publicUserId).single();
  const email = normalizeEmail(profile?.email);
  if (!email) return NextResponse.json({ error: "Il profilo richiede assistenza" }, { status: 409 });
  const supabase = await createSupabaseAuthServerClient();
  const existing = await findAuthUserByEmail(email).catch(() => null);
  if (existing) {
    const { data: onboarding } = await sb.from("user_auth_onboarding").select("flow,state")
      .eq("auth_user_id", existing.id).maybeSingle();
    if (onboarding?.flow === "activation" && onboarding.state === "pending_verification") {
      await supabase.auth.resend({ type: "signup", email,
        options: { emailRedirectTo: authRedirect("/auth/callback?flow=activation") } });
    } else if (!onboarding) {
      await sendPreHotfixActivationEmail(email);
    }
    return NextResponse.json({ ok: true, message: genericEmailMessage });
  }
  const { data, error } = await supabase.auth.signUp({ email, password: String(body.password),
    options: { emailRedirectTo: authRedirect("/auth/callback?flow=activation") } });
  if (!error && data.user && (data.user.identities?.length ?? 0) > 0) {
    await sb.from("user_auth_onboarding").upsert({ auth_user_id: data.user.id, flow: "activation",
      state: "pending_verification", normalized_email: email, full_name: context.normalizedName,
      normalized_phone: context.normalizedPhone }, { onConflict: "auth_user_id", ignoreDuplicates: true });
    await sb.rpc("start_user_auth_migration", { p_public_user_id: context.publicUserId });
  }
  return NextResponse.json({ ok: true, message: genericEmailMessage });
}
