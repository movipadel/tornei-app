import { NextResponse } from "next/server";

import { getCurrentMoviUser } from "@/lib/currentMoviUser";
import {
  movibackActivationRateLimitKeys,
  publicMovibackActivationError,
  type MovibackAgreementActivationResult,
} from "@/lib/movibackAgreementActivation";
import {
  hashMovibackAgreementCode,
  normalizeMovibackAgreementCode,
} from "@/lib/movibackAgreementCodes";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type RateLimitResult = { allowed?: boolean; retry_after_seconds?: number };

export async function POST(request: Request) {
  const identity = await getCurrentMoviUser();
  if (!identity.public_user_id || identity.conflict_state) {
    return NextResponse.json({ error: "Accedi per attivare una convenzione." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const code = String(body.code ?? "");
  const normalized = normalizeMovibackAgreementCode(code);
  if (!normalized || normalized.length > 64) {
    return NextResponse.json({ error: "Codice convenzione non valido." }, { status: 400 });
  }

  const sb = supabaseAdmin();
  let keys: ReturnType<typeof movibackActivationRateLimitKeys>;
  try {
    keys = movibackActivationRateLimitKeys(request, identity.public_user_id);
  } catch {
    return NextResponse.json({ error: "Attivazione temporaneamente non disponibile." }, { status: 503 });
  }

  const { data: limitData, error: limitError } = await sb.rpc("consume_legacy_login_rate_limit", {
    p_client_key: keys.clientKey,
    p_identity_key: keys.identityKey,
  });
  if (limitError) {
    return NextResponse.json({ error: "Attivazione temporaneamente non disponibile." }, { status: 503 });
  }
  const limit = (limitData ?? {}) as RateLimitResult;
  if (!limit.allowed) {
    const retryAfter = Math.max(1, Math.ceil(Number(limit.retry_after_seconds) || 900));
    return NextResponse.json(
      { error: "Troppi tentativi. Riprova più tardi." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const { data, error } = await sb.rpc("claim_moviback_agreement_code", {
    p_user_id: identity.public_user_id,
    p_code_hash: hashMovibackAgreementCode(normalized),
  });
  if (error) {
    console.error("MoviBack agreement activation failed", error.code);
    return NextResponse.json({ error: "Attivazione convenzione non riuscita." }, { status: 500 });
  }

  const result = (data ?? {}) as MovibackAgreementActivationResult;
  if (!result.ok) {
    const failure = publicMovibackActivationError(String(result.error_code ?? ""));
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }

  return NextResponse.json({
    success: true,
    replayed: Boolean(result.replayed),
    agreement: result.agreement,
  });
}
