import "server-only";

import crypto from "node:crypto";
import { isIP } from "node:net";

function firstValidIp(value: string | null) {
  for (const item of String(value ?? "").split(",")) {
    let candidate = item.trim();
    if (candidate.startsWith("[") && candidate.includes("]")) {
      candidate = candidate.slice(1, candidate.indexOf("]"));
    } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
      candidate = candidate.slice(0, candidate.lastIndexOf(":"));
    }
    if (isIP(candidate)) return candidate.toLowerCase();
  }
  return null;
}

function clientAddress(request: Request) {
  if (process.env.VERCEL === "1") {
    return firstValidIp(request.headers.get("x-vercel-forwarded-for"))
      ?? firstValidIp(request.headers.get("x-real-ip"))
      ?? "unavailable";
  }
  if (process.env.LEGACY_RATE_LIMIT_TRUST_PROXY_HEADERS === "true") {
    return firstValidIp(request.headers.get("x-forwarded-for"))
      ?? firstValidIp(request.headers.get("x-real-ip"))
      ?? "unavailable";
  }
  return "unavailable";
}

function normalizedPhoneSignal(value: string) {
  let phone = value.trim().replace(/[\s().-]+/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (/^3\d{9}$/.test(phone)) return `+39${phone}`;
  return phone.toLowerCase() || "blank";
}

function hmac(secret: string, value: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function legacyLoginRateLimitKeys(request: Request, phone: string, email: string) {
  const secret = process.env.LEGACY_RATE_LIMIT_SECRET?.trim()
    || process.env.USER_COOKIE_SECRET?.trim();
  if (!secret) throw new Error("Missing LEGACY_RATE_LIMIT_SECRET or USER_COOKIE_SECRET");
  const address = clientAddress(request);
  const emailSignal = email.trim().toLowerCase() || "blank";
  const phoneSignal = normalizedPhoneSignal(phone);
  return {
    clientKey: hmac(secret, `client\0${address}`),
    identityKey: hmac(secret, `client_identity\0${address}\0${phoneSignal}\0${emailSignal}`),
  };
}
