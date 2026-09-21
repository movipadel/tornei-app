import { NextResponse } from "next/server";
import { authRedirect, genericEmailMessage, normalizeEmail } from "@/lib/authFlow";
import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  if (email) {
    const supabase = await createSupabaseAuthServerClient();
    await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: authRedirect("/auth/callback?next=/attiva-account?verified=1") },
    });
  }
  return NextResponse.json({ ok: true, message: genericEmailMessage });
}
