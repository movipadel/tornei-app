// src/lib/adminSession.ts
import { SignJWT, jwtVerify } from "jose";

export const ADMIN_COOKIE_NAME =
  process.env.ADMIN_COOKIE_NAME?.trim() || "admin_session";

const encoder = new TextEncoder();

function getSecret() {
  const s = (process.env.ADMIN_COOKIE_SECRET || "").trim();
  if (!s) throw new Error("Missing ADMIN_COOKIE_SECRET");
  return encoder.encode(s);
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/", // IMPORTANTISSIMO
    maxAge: 60 * 60 * 24 * 7, // 7 giorni
  };
}

export async function createAdminSessionToken(payload: Record<string, any> = {}) {
  // JWT valido 7 giorni
  return await new SignJWT({ ...payload, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyAdminSessionToken(token: string) {
  const { payload } = await jwtVerify(token, getSecret());
  return payload;
}
