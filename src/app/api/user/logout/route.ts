import { NextResponse } from "next/server";
import { USER_COOKIE_NAME } from "@/lib/userAuth";
import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createSupabaseAuthServerClient();
  await supabase.auth.signOut({ scope: "local" });
  const res = NextResponse.json({ ok: true });

  res.cookies.set(USER_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return res;
}
