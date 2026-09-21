import { NextResponse } from "next/server";
import { validPassword } from "@/lib/authFlow";
import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!validPassword(body.password) || body.password !== body.password_confirm) {
    return NextResponse.json({ error: "Le password devono coincidere e avere almeno 8 caratteri" }, { status: 400 });
  }
  const supabase = await createSupabaseAuthServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.email_confirmed_at) {
    return NextResponse.json({ error: "Email verificata richiesta" }, { status: 403 });
  }
  const { error: passwordError } = await supabase.auth.updateUser({ password: body.password });
  if (passwordError) return NextResponse.json({ error: "Password non accettata" }, { status: 400 });
  const { data, error } = await supabaseAdmin().rpc("resolve_and_link_verified_auth_user", {
    p_auth_user_id: userData.user.id,
  });
  if (error) return NextResponse.json({ error: "Impossibile collegare il profilo" }, { status: 409 });
  return NextResponse.json(data);
}
