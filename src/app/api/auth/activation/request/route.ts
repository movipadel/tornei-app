import { NextResponse } from "next/server";
import { authRedirect, genericEmailMessage, normalizeEmail, validPassword } from "@/lib/authFlow";
import { getCurrentMoviUser } from "@/lib/currentMoviUser";
import { findAuthUserByEmail } from "@/lib/authUserLookup";
import { sendPreHotfixActivationEmail } from "@/lib/preHotfixActivation";
import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  if (!email || !validPassword(body.password) || body.password !== body.password_confirm) {
    return NextResponse.json({ error: "Email o password non valide" }, { status: 400 });
  }

  const identity = await getCurrentMoviUser();
  const profileEmail = normalizeEmail(identity.source === "legacy" ? identity.profile?.email : "");

  // A legacy session helps prefill the form, but verified email remains the proof
  // of ownership. When a profile is known, never let the request silently switch it.
  if (!profileEmail || profileEmail === email) {
    let existingAuthUser: Awaited<ReturnType<typeof findAuthUserByEmail>>;
    let onboarding: { flow: string; state: string } | null = null;
    try {
      existingAuthUser = await findAuthUserByEmail(email);
      if (existingAuthUser) {
        const result = await supabaseAdmin().from("user_auth_onboarding").select("flow,state").eq("auth_user_id", existingAuthUser.id).maybeSingle();
        if (result.error) throw result.error;
        onboarding = result.data;
      }
    } catch {
      return NextResponse.json({ ok: true, message: genericEmailMessage });
    }

    if (!existingAuthUser) {
      const supabase = await createSupabaseAuthServerClient();
      const { data } = await supabase.auth.signUp({
        email,
        password: body.password,
        options: { emailRedirectTo: authRedirect("/auth/callback?flow=activation") },
      });
      if (data.user && (data.user.identities?.length ?? 0) > 0) {
        await supabaseAdmin().from("user_auth_onboarding").upsert({
          auth_user_id: data.user.id,
          flow: "activation",
          state: "pending_verification",
          normalized_email: email,
        }, { onConflict: "auth_user_id", ignoreDuplicates: true });
      }
    } else if (!onboarding) {
      // OTP-created Stage 5A users have no password. Their compatibility link must
      // retain the old password step; a repeated signUp cannot set that password.
      await sendPreHotfixActivationEmail(email);
    }
  }
  return NextResponse.json({ ok: true, message: genericEmailMessage });
}
