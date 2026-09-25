import { NextResponse } from "next/server";
import { authRedirect, genericEmailMessage, normalizeEmail, validPassword } from "@/lib/authFlow";
import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  if (!email || !validPassword(body.password) || body.password !== body.password_confirm) {
    return NextResponse.json({ error: "Email o password non valide" }, { status: 400 });
  }
  const fullName = String(body.full_name ?? "").trim();
  const gender = String(body.gender ?? "").trim().toUpperCase();
  const privacyAccepted = Boolean(body.privacy_accepted);
  const termsAccepted = Boolean(body.terms_accepted);
  const ageConfirmed = Boolean(body.age_confirmed);
  if (!fullName || !["M", "F"].includes(gender) || !privacyAccepted || !termsAccepted || !ageConfirmed) {
    return NextResponse.json({ error: "Dati o consensi obbligatori mancanti" }, { status: 400 });
  }
  const admin = supabaseAdmin();
  const { data: normalizedPhone } = await admin.rpc("normalize_user_mobile_e164", {
    p_phone: String(body.phone ?? ""),
  });
  if (!normalizedPhone) return NextResponse.json({ error: "Numero mobile non valido" }, { status: 400 });

  // This service-only preflight runs before Auth signup, so a historical MOVI
  // customer is sent to activation before a second identity can be created.
  const { data: preflight, error: preflightError } = await admin.rpc("new_user_profile_preflight", {
    p_phone: normalizedPhone,
    p_email: email,
  });
  if (preflightError) return NextResponse.json({ error: "Controllo profilo non disponibile" }, { status: 500 });
  if ((preflight as { state?: string } | null)?.state === "existing_profile") {
    return NextResponse.json({ state: "existing_profile", redirect_to: "/attiva-account" });
  }

  const supabase = await createSupabaseAuthServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: body.password,
    options: { emailRedirectTo: authRedirect("/auth/callback?flow=signup") },
  });

  // Supabase intentionally obscures duplicate signups. Only a newly-created identity
  // with a real provider identity receives a private profile draft.
  if (!error && data.user && (data.user.identities?.length ?? 0) > 0) {
    const { data: prepared } = await admin.rpc("prepare_user_auth_signup", {
      p_auth_user_id: data.user.id,
      p_full_name: fullName,
      p_phone: normalizedPhone,
      p_gender: gender,
      p_privacy_accepted: privacyAccepted,
      p_terms_accepted: termsAccepted,
      p_age_confirmed: ageConfirmed,
      p_marketing_accepted: Boolean(body.marketing_accepted),
    });
    if ((prepared as { state?: string } | null)?.state === "invalid_phone") {
      return NextResponse.json({ error: "Numero mobile non valido" }, { status: 400 });
    }
    if ((prepared as { state?: string } | null)?.state === "invalid_profile") {
      return NextResponse.json({ error: "Dati o consensi obbligatori mancanti" }, { status: 400 });
    }
  }
  return NextResponse.json({ ok: true, message: genericEmailMessage });
}
