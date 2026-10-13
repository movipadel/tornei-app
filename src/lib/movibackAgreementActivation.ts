import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export type MovibackAgreementActivationResult = {
  ok?: boolean;
  replayed?: boolean;
  error_code?: string;
  entitlement_id?: string;
  agreement?: {
    id: string;
    name: string;
    multiplier: number;
    effective_from: string;
    effective_until: string | null;
    status: string;
  };
};

const errors: Record<string, { status: number; message: string }> = {
  INVALID_CODE: { status: 400, message: "Codice convenzione non valido." },
  CODE_ALREADY_USED: { status: 409, message: "Questo codice è già stato utilizzato." },
  CODE_EXPIRED: { status: 410, message: "Questo codice è scaduto." },
  CODE_REVOKED: { status: 410, message: "Questo codice non è più valido." },
  AGREEMENT_NOT_ACTIVE: { status: 409, message: "Questa convenzione non è attualmente attiva." },
  ACTIVE_ENTITLEMENT_EXISTS: { status: 409, message: "Hai già una convenzione attiva." },
  MEMBERSHIP_NOT_FOUND: { status: 403, message: "Devi avere una tessera MoviBack approvata per attivare una convenzione." },
  MEMBERSHIP_NOT_ELIGIBLE: { status: 403, message: "La tua tessera MoviBack non è idonea all’attivazione." },
  MEMBERSHIP_AMBIGUOUS: { status: 409, message: "La tua tessera MoviBack richiede una verifica." },
};

export function publicMovibackActivationError(code: string) {
  return errors[code] ?? { status: 500, message: "Attivazione convenzione non riuscita." };
}

function firstIp(value: string | null) {
  for (const part of String(value ?? "").split(",")) {
    const candidate = part.trim().replace(/^\[|\]$/g, "").replace(/:\d+$/, "");
    if (isIP(candidate)) return candidate.toLowerCase();
  }
  return "unavailable";
}

export function movibackActivationRateLimitKeys(request: Request, publicUserId: string) {
  return movibackRateLimitKeys(request, publicUserId, "activation");
}

export function movibackEnrollmentRateLimitKeys(request: Request, publicUserId: string) {
  return movibackRateLimitKeys(request, publicUserId, "enrollment");
}

function movibackRateLimitKeys(request: Request, publicUserId: string, scope: "activation" | "enrollment") {
  const secret = process.env.LEGACY_RATE_LIMIT_SECRET?.trim() || process.env.USER_COOKIE_SECRET?.trim();
  if (!secret) throw new Error("Missing rate-limit secret");
  const address = process.env.VERCEL === "1"
    ? firstIp(request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-real-ip"))
    : process.env.LEGACY_RATE_LIMIT_TRUST_PROXY_HEADERS === "true"
      ? firstIp(request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"))
      : "unavailable";
  const hmac = (value: string) => createHmac("sha256", secret).update(value).digest("hex");
  const prefix = scope === "activation" ? "moviback_agreement" : "moviback_agreement_enrollment";
  return {
    clientKey: hmac(`${prefix}_client\0${address}`),
    identityKey: hmac(`${prefix}_identity\0${address}\0${publicUserId}`),
  };
}
