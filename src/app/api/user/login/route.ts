import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  createUserSessionToken,
  userCookieOptions,
  USER_COOKIE_NAME,
} from "@/lib/userAuth";

export const runtime = "nodejs";

const normalizePhone = (s: string) => s.trim().replace(/\s+/g, "");

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const full_name = String(body.full_name ?? "").trim();
  const phone = normalizePhone(String(body.phone ?? ""));
  const email = String(body.email ?? "").trim();
  const gender = String(body.gender ?? "").trim().toUpperCase();

  const privacyAccepted = Boolean(body.privacy_accepted);
  const termsAccepted = Boolean(body.terms_accepted);
  const ageConfirmed = Boolean(body.age_confirmed);
  const marketingAccepted = Boolean(body.marketing_accepted);

  if (!full_name) {
    return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
  }

  if (!phone) {
    return NextResponse.json({ error: "Telefono obbligatorio" }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ error: "Email obbligatoria" }, { status: 400 });
  }

  if (!["M", "F"].includes(gender)) {
    return NextResponse.json({ error: "Sesso non valido (M/F)" }, { status: 400 });
  }

  if (!privacyAccepted) {
    return NextResponse.json(
      { error: "Privacy Policy obbligatoria" },
      { status: 400 }
    );
  }

  if (!termsAccepted) {
    return NextResponse.json(
      { error: "Termini di utilizzo obbligatori" },
      { status: 400 }
    );
  }

  if (!ageConfirmed) {
    return NextResponse.json(
      { error: "Conferma maggiore età obbligatoria" },
      { status: 400 }
    );
  }

  const sb = supabaseAdmin();
  const now = new Date().toISOString();

  const payload = {
    full_name,
    phone,
    email,
    gender,
    privacy_accepted_at: now,
    terms_accepted_at: now,
    age_confirmed_at: now,
    marketing_accepted: marketingAccepted,
    marketing_accepted_at: marketingAccepted ? now : null,
    updated_at: now,
  };

  const { data, error } = await sb
    .from("users")
    .upsert(payload, { onConflict: "phone" })
    .select(
      "id,full_name,phone,email,gender,privacy_accepted_at,terms_accepted_at,age_confirmed_at,marketing_accepted,marketing_accepted_at"
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const token = createUserSessionToken(data.id);

  const res = NextResponse.json({ user: data });
  res.cookies.set(USER_COOKIE_NAME, token, userCookieOptions());
  return res;
}