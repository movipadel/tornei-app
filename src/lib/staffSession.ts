import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

export const STAFF_COOKIE_NAME =
  process.env.STAFF_COOKIE_NAME?.trim() || "staff_session";

const encoder = new TextEncoder();

function getSecret() {
  const secret =
    process.env.STAFF_COOKIE_SECRET?.trim() ||
    process.env.ADMIN_COOKIE_SECRET?.trim();

  if (!secret) throw new Error("Missing STAFF_COOKIE_SECRET or ADMIN_COOKIE_SECRET");

  return encoder.encode(secret);
}

export type StaffRole = "admin" | "staff";

export type StaffSessionPayload = {
  sid: string;
  role: StaffRole;
  name?: string;
  email?: string;
};

export function staffCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  };
}

export async function createStaffSessionToken(payload: StaffSessionPayload) {
  return await new SignJWT({
    sid: payload.sid,
    role: payload.role,
    name: payload.name,
    email: payload.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("180d")
    .sign(getSecret());
}

export async function verifyStaffSessionToken(token?: string | null) {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());

    const sid = String(payload.sid ?? "");
    const role = String(payload.role ?? "");

    if (!sid) return null;
    if (role !== "admin" && role !== "staff") return null;

    return {
      sid,
      role,
      name: typeof payload.name === "string" ? payload.name : undefined,
      email: typeof payload.email === "string" ? payload.email : undefined,
    } as StaffSessionPayload;
  } catch {
    return null;
  }
}

export async function getStaffSessionFromCookie() {
  const c = await cookies();
  const token = c.get(STAFF_COOKIE_NAME)?.value ?? null;
  return verifyStaffSessionToken(token);
}