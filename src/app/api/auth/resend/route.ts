import { NextResponse } from "next/server";
import { authRedirect, genericEmailMessage, normalizeEmail } from "@/lib/authFlow";
import { getCurrentMoviUser } from "@/lib/currentMoviUser";
import { findAuthUserByEmail } from "@/lib/authUserLookup";
import { sendPreHotfixActivationEmail } from "@/lib/preHotfixActivation";
import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const flow = body.flow === "activation" ? "activation" : body.flow === "signup" ? "signup" : null;

  if (email && flow) {
    const identity = flow === "activation" ? await getCurrentMoviUser() : null;
    const profileEmail = normalizeEmail(identity?.source === "legacy" ? identity.profile?.email : "");
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
      if (existingAuthUser && onboarding?.flow === flow && onboarding.state === "pending_verification") {
        const supabase = await createSupabaseAuthServerClient();
        await supabase.auth.resend({
          type: "signup",
          email,
          options: { emailRedirectTo: authRedirect(`/auth/callback?flow=${flow}`) },
        });
      } else if (flow === "activation" && existingAuthUser && !onboarding) {
        await sendPreHotfixActivationEmail(email);
      }
    }
  }

  return NextResponse.json({ ok: true, message: genericEmailMessage });
}
