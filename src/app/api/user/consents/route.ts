import { NextResponse } from "next/server";
import { getCurrentMoviUser } from "@/lib/currentMoviUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const identity = await getCurrentMoviUser();
  if (identity.conflict_state || !identity.public_user_id || !identity.profile) {
    return NextResponse.json({ error: "Sessione utente valida richiesta" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  if (!body.privacy_accepted || !body.terms_accepted || !body.age_confirmed) {
    return NextResponse.json({ error: "Consensi obbligatori mancanti" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const marketingAccepted = Boolean(body.marketing_accepted);
  const { data, error } = await supabaseAdmin().from("users").update({
    privacy_accepted_at: now,
    terms_accepted_at: now,
    age_confirmed_at: now,
    marketing_accepted: marketingAccepted,
    marketing_accepted_at: marketingAccepted ? now : null,
    updated_at: now,
  }).eq("id", identity.public_user_id)
    .select("id,full_name,phone,email,gender,privacy_accepted_at,terms_accepted_at,age_confirmed_at,marketing_accepted,marketing_accepted_at")
    .single();
  if (error) return NextResponse.json({ error: "Impossibile aggiornare i consensi" }, { status: 500 });
  return NextResponse.json({ user: data });
}
