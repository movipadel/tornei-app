import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";
import { authRedirect } from "@/lib/authFlow";
import { resolveVerifiedAuthOnboarding } from "@/lib/resolveAuthOnboarding";
import { USER_COOKIE_NAME, userCookieOptions } from "@/lib/userAuth";

const legacyActivationNext = "/attiva-account?verified=1";
const legacySignupNext = "/registrati?verified=1";

function resultRedirect(flow: "activation" | "signup", state: string) {
  if (state === "linked") return flow === "activation" ? "/?auth=activated" : "/?auth=registered";
  if (state === "review_required") return `/${flow === "signup" ? "registrati" : "attiva-account"}?result=review`;
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

  if (flow || exchanged) {
    // A valid session also makes an already-consumed callback resumable. Both RPCs
    // are transactionally idempotent, so replay cannot create another profile/link.
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (!userError && userData.user?.email_confirmed_at) {
      try {
        const result = await resolveVerifiedAuthOnboarding(userData.user, flow);
        const response = NextResponse.redirect(authRedirect(resultRedirect(result.flow, result.state)));
        if (result.state === "linked") {
          response.cookies.set(USER_COOKIE_NAME, "", { ...userCookieOptions(), maxAge: 0 });
        }
        return response;
      } catch { /* fall through to the fixed link error */ }
    }
  }
  return NextResponse.redirect(authRedirect("/accedi?error=link"));
}
