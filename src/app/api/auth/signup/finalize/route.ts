import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createSupabaseAuthServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.email_confirmed_at) {
    return NextResponse.json({ error: "Email verificata richiesta" }, { status: 403 });
  }
  const { data, error } = await supabaseAdmin().rpc("finalize_verified_auth_signup", {
    p_auth_user_id: userData.user.id,
  });
  if (error) return NextResponse.json({ error: "Impossibile creare il profilo" }, { status: 409 });
  return NextResponse.json(data);
}
