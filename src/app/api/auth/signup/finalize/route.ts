import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";
import { resolveVerifiedAuthOnboarding } from "@/lib/resolveAuthOnboarding";
import { USER_COOKIE_NAME, userCookieOptions } from "@/lib/userAuth";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createSupabaseAuthServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.email_confirmed_at) {
    return NextResponse.json({ error: "Email verificata richiesta" }, { status: 403 });
  }
  let result;
  try {
    result = await resolveVerifiedAuthOnboarding(userData.user, "signup");
  } catch {
    return NextResponse.json({ error: "Impossibile creare il profilo" }, { status: 409 });
  }
  const response = NextResponse.json(result.data);
  if (result.state === "linked") {
    response.cookies.set(USER_COOKIE_NAME, "", { ...userCookieOptions(), maxAge: 0 });
  }
  return response;
}
