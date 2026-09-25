import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/accessHelpContext";
import { authRedirect, normalizeEmail, genericEmailMessage } from "@/lib/authFlow";
import { findAuthUserByEmail } from "@/lib/authUserLookup";
import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST() {
  const context = await getAccessContext();
  if (!context?.publicUserId || context.state !== "found") return NextResponse.json({ ok: true, message: genericEmailMessage });
  const sb = supabaseAdmin();
  const { data: profile } = await sb.from("users").select("email").eq("id", context.publicUserId)
    .eq("identity_status", "active").is("auth_user_id", null).maybeSingle();
  const email = normalizeEmail(profile?.email);
  if (email) {
    const user = await findAuthUserByEmail(email).catch(() => null);
    if (user) {
      const { data: onboarding } = await sb.from("user_auth_onboarding").select("flow,state")
        .eq("auth_user_id", user.id).maybeSingle();
      if (onboarding?.flow === "activation" && onboarding.state === "pending_verification") {
        const auth = await createSupabaseAuthServerClient();
        await auth.auth.resend({ type: "signup", email,
          options: { emailRedirectTo: authRedirect("/auth/callback?flow=activation") } });
      }
    }
  }
  return NextResponse.json({ ok: true, message: genericEmailMessage });
}
