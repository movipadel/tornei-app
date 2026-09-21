import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  createUserSessionToken,
  userCookieOptions,
  USER_COOKIE_NAME,
} from "@/lib/userAuth";

export const runtime = "nodejs";

type LookupResult = { state?: string; public_user_id?: string | null };

export async function POST(req: Request) {
  // Stage 5B is fail-closed. An explicit false disables this endpoint; it never
  // restores the historical create/upsert behavior.
  if (process.env.AUTH2_LEGACY_REGISTRATION_DISABLED === "false") {
    return NextResponse.json(
      { error: "Accesso precedente temporaneamente non disponibile", code: "LEGACY_CUTOVER_CONFIG_DISABLED" },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const phone = String(body.phone ?? "").trim();
  const email = String(body.email ?? "").trim();
  if (!phone || !email) {
    return NextResponse.json({ error: "Telefono ed email sono obbligatori" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("legacy_user_login_lookup", {
    p_phone: phone,
    p_email: email,
  });
  if (error) {
    return NextResponse.json({ error: "Accesso temporaneamente non disponibile" }, { status: 500 });
  }

  const lookup = (data ?? {}) as LookupResult;
  const state = String(lookup.state ?? "not_found");
  if (state === "not_found") {
    return NextResponse.json(
      {
        error: "Profilo non trovato. Registrati con il nuovo accesso MOVI.",
        code: "LEGACY_PROFILE_NOT_FOUND",
        redirect_to: "/registrati",
      },
      { status: 404 },
    );
  }
  if (state === "auth_required" || state === "merged") {
    return NextResponse.json(
      {
        error: "Questo profilo richiede il nuovo accesso con email e password.",
        code: "AUTH_LOGIN_REQUIRED",
        redirect_to: "/accedi",
      },
      { status: 409 },
    );
  }
  if (state === "review_required") {
    return NextResponse.json(
      {
        error: "Questo profilo richiede una verifica manuale prima di un nuovo accesso.",
        code: "LEGACY_REVIEW_REQUIRED",
      },
      { status: 409 },
    );
  }
  if (state === "conflict") {
    return NextResponse.json(
      {
        error: "Questo profilo richiede assistenza prima di un nuovo accesso.",
        code: "LEGACY_CONFLICT",
      },
      { status: 409 },
    );
  }
  if (state !== "legacy_allowed" || !lookup.public_user_id) {
    return NextResponse.json({ error: "Accesso non disponibile" }, { status: 403 });
  }

  // Re-read the exact row after the serialized decision. This does not mutate
  // profile data and catches links or merges completed immediately afterwards.
  const { data: profile, error: profileError } = await sb
    .from("users")
    .select("id,full_name,phone,email,gender,privacy_accepted_at,terms_accepted_at,age_confirmed_at,marketing_accepted,marketing_accepted_at,auth_user_id,identity_status,auth_migration_state")
    .eq("id", lookup.public_user_id)
    .maybeSingle();
  if (profileError || !profile) {
    return NextResponse.json({ error: "Accesso non disponibile" }, { status: 403 });
  }
  if (profile.auth_user_id || profile.identity_status !== "active" || !["legacy", "activation_pending"].includes(profile.auth_migration_state)) {
    return NextResponse.json(
      { error: "Questo profilo richiede il nuovo accesso con email e password.", code: "AUTH_LOGIN_REQUIRED", redirect_to: "/accedi" },
      { status: 409 },
    );
  }

  const publicUser = {
    id: profile.id,
    full_name: profile.full_name,
    phone: profile.phone,
    email: profile.email,
    gender: profile.gender,
    privacy_accepted_at: profile.privacy_accepted_at,
    terms_accepted_at: profile.terms_accepted_at,
    age_confirmed_at: profile.age_confirmed_at,
    marketing_accepted: profile.marketing_accepted,
    marketing_accepted_at: profile.marketing_accepted_at,
  };
  const res = NextResponse.json({
    user: publicUser,
    migration: {
      status: "available",
      activation_available: true,
      message: "Nuovo accesso MOVI disponibile",
    },
  });
  res.cookies.set(USER_COOKIE_NAME, createUserSessionToken(profile.id), userCookieOptions());
  return res;
}
