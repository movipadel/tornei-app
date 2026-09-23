import { NextResponse } from "next/server";
import { resolveVerifiedAuthOnboarding } from "@/lib/resolveAuthOnboarding";
import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";
import { USER_COOKIE_NAME, userCookieOptions } from "@/lib/userAuth";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createSupabaseAuthServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email_confirmed_at) {
    return NextResponse.json({ error: "Sessione verificata richiesta" }, { status: 403 });
  }

  try {
    const result = await resolveVerifiedAuthOnboarding(data.user);
    const response = NextResponse.json({ state: result.state });
    if (result.state === "linked") {
      response.cookies.set(USER_COOKIE_NAME, "", { ...userCookieOptions(), maxAge: 0 });
    }
    return response;
  } catch {
    return NextResponse.json({ error: "Impossibile completare l’accesso" }, { status: 409 });
  }
}
