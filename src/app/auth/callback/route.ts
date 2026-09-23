import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";
import { authRedirect } from "@/lib/authFlow";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { USER_COOKIE_NAME, userCookieOptions } from "@/lib/userAuth";

const legacyActivationNext = "/attiva-account?verified=1";
const legacySignupNext = "/registrati?verified=1";

function resultRedirect(flow: "activation" | "signup", state: string) {
  if (state === "linked") return flow === "activation" ? "/?auth=activated" : "/?auth=registered";
  if (state === "review_required") return "/attiva-account?result=review";
  if (state === "no_profile") return "/attiva-account?result=no-profile";
  return `/${flow === "signup" ? "registrati" : "attiva-account"}?result=conflict`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const requestedFlow = url.searchParams.get("flow");
  const flow = requestedFlow === "activation" || requestedFlow === "signup"
    ? requestedFlow
    : requestedNext === legacySignupNext
      ? "signup"
      : null;

  const supabase = await createSupabaseAuthServerClient();
  let exchanged = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    exchanged = !error;
    if (!error && requestedNext === legacyActivationNext) {
      return NextResponse.redirect(authRedirect(legacyActivationNext));
    }
  }

  if (requestedNext === "/reset-password" && exchanged) {
    return NextResponse.redirect(authRedirect("/reset-password"));
  }

  if (flow) {
    // A valid session also makes an already-consumed callback resumable. Both RPCs
    // are transactionally idempotent, so replay cannot create another profile/link.
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (!userError && userData.user?.email_confirmed_at) {
      const rpc = flow === "signup" ? "finalize_verified_auth_signup" : "resolve_and_link_verified_auth_user";
      const { data, error } = await supabaseAdmin().rpc(rpc, { p_auth_user_id: userData.user.id });
      if (!error) {
        const state = String((data as { state?: string } | null)?.state ?? "conflict");
        const response = NextResponse.redirect(authRedirect(resultRedirect(flow, state)));
        if (state === "linked") {
          response.cookies.set(USER_COOKIE_NAME, "", { ...userCookieOptions(), maxAge: 0 });
        }
        return response;
      }
    }
  }
  return NextResponse.redirect(authRedirect("/accedi?error=link"));
}
