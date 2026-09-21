import { NextResponse } from "next/server";
import { validPassword } from "@/lib/authFlow";
import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!validPassword(body.password) || body.password !== body.password_confirm) {
    return NextResponse.json({ error: "Le password devono coincidere e avere almeno 8 caratteri" }, { status: 400 });
  }
  const supabase = await createSupabaseAuthServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Link non valido o scaduto" }, { status: 401 });
  const { error } = await supabase.auth.updateUser({ password: body.password });
  if (error) return NextResponse.json({ error: "Password non accettata" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
