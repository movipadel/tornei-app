import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";
import { normalizeEmail } from "@/lib/authFlow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  if (!email || !password) return NextResponse.json({ error: "Credenziali mancanti" }, { status: 400 });
  const supabase = await createSupabaseAuthServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: "Email o password non validi" }, { status: 401 });
  return NextResponse.json({ ok: true });
}
