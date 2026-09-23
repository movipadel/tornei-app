import "server-only";

import { authRedirect } from "@/lib/authFlow";
import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";

export async function sendPreHotfixActivationEmail(email: string) {
  const supabase = await createSupabaseAuthServerClient();
  return supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: authRedirect("/auth/callback?next=/attiva-account?verified=1"),
    },
  });
}
