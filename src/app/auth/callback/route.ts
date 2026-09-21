import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";
import { authRedirect } from "@/lib/authFlow";

const allowedNext = new Set(["/attiva-account?verified=1", "/registrati?verified=1", "/reset-password"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") ?? "/accedi";
  const next = allowedNext.has(requestedNext) ? requestedNext : "/accedi";
  if (code) {
    const supabase = await createSupabaseAuthServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(authRedirect(next));
  }
  return NextResponse.redirect(authRedirect("/accedi?error=link"));
}
