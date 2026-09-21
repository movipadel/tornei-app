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

  const { data: migrationPreflight, error: migrationPreflightError } = await sb.rpc("legacy_user_auth_migration_preflight", { p_phone: phone });
  if (migrationPreflightError) return NextResponse.json({ error: "Accesso temporaneamente non disponibile" }, { status: 500 });
  const preflightState = String((migrationPreflight as { state?: string } | null)?.state ?? "legacy_allowed");
  const preflightUserId = String((migrationPreflight as { public_user_id?: string } | null)?.public_user_id ?? "");
  if (preflightState === "auth_required") {
    return NextResponse.json(
      { error: "Questo profilo richiede il nuovo accesso con email e password", code: "AUTH_LOGIN_REQUIRED", redirect_to: "/accedi" },
      { status: 409 }
    );
  }
  if (preflightState === "merged") {
    return NextResponse.json(
      { error: "Questo profilo non è più attivo. Usa l’accesso associato al profilo principale" },
      { status: 409 }
    );
  }

  // A profile already activated with Supabase Auth cannot be claimed through
  // the possession-free legacy form. Unlinked legacy profiles keep working.
  let existingQuery = sb.from("users").select("id,email,phone,auth_user_id,identity_status,auth_migration_state");
  existingQuery = preflightUserId ? existingQuery.eq("id", preflightUserId) : existingQuery.eq("phone", phone);
  const { data: existing } = await existingQuery.maybeSingle();
  if (existing?.identity_status === "merged") {
    return NextResponse.json(
      { error: "Questo profilo non è più attivo. Usa l’accesso associato al profilo principale" },
      { status: 409 }
    );
  }
  if (existing?.auth_user_id) {
    return NextResponse.json(
      { error: "Questo profilo richiede il nuovo accesso con email e password", code: "AUTH_LOGIN_REQUIRED", redirect_to: "/accedi" },
      { status: 409 }
    );
  }

  const payload = {
    full_name,
    phone: existing?.phone ?? phone,
    email: existing?.email ?? email,
    gender,
    privacy_accepted_at: now,
    terms_accepted_at: now,
    age_confirmed_at: now,
    marketing_accepted: marketingAccepted,
    marketing_accepted_at: marketingAccepted ? now : null,
    updated_at: now,
  };

  const fields = "id,full_name,phone,email,gender,privacy_accepted_at,terms_accepted_at,age_confirmed_at,marketing_accepted,marketing_accepted_at,auth_migration_state";
  const result = existing
    ? await sb.from("users").update(payload).eq("id", existing.id).select(fields).single()
    : await sb.from("users").upsert(payload, { onConflict: "phone" }).select(fields).single();
  const { data, error } = result;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const token = createUserSessionToken(data.id);
  const migrationState = data.auth_migration_state;
  const publicUser = {
    id: data.id, full_name: data.full_name, phone: data.phone, email: data.email, gender: data.gender,
    privacy_accepted_at: data.privacy_accepted_at, terms_accepted_at: data.terms_accepted_at,
    age_confirmed_at: data.age_confirmed_at, marketing_accepted: data.marketing_accepted,
    marketing_accepted_at: data.marketing_accepted_at,
  };

  const res = NextResponse.json({
    user: publicUser,
    migration: {
      status: migrationState === "review_required" ? "review_required" : migrationState === "conflict" ? "conflict" : "available",
      activation_available: migrationState === "legacy" || migrationState === "activation_pending",
      message: migrationState === "review_required"
        ? "Il passaggio al nuovo accesso richiede una verifica manuale. Il tuo accesso attuale resta disponibile."
        : "Nuovo accesso MOVI disponibile",
    },
  });
  res.cookies.set(USER_COOKIE_NAME, token, userCookieOptions());
  return res;
}
