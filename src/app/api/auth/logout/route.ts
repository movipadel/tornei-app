import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";
import { USER_COOKIE_NAME } from "@/lib/userAuth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const scope = body.scope === "auth" || body.scope === "legacy" ? body.scope : "all";
  if (scope !== "legacy") {
    const supabase = await createSupabaseAuthServerClient();
    await supabase.auth.signOut({ scope: "local" });
  }
  const response = NextResponse.json({ ok: true });
  if (scope !== "auth") response.cookies.set(USER_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}
