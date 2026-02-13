import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";

export const USER_COOKIE_NAME = process.env.USER_COOKIE_NAME ?? "user_session";
const SECRET = process.env.USER_COOKIE_SECRET;

function sign(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

type SessionPayload = {
  uid: string;
  iat: number;
  exp: number;
};

export function createUserSessionToken(userId: string) {
  if (!SECRET) throw new Error("Missing USER_COOKIE_SECRET");
  const now = Math.floor(Date.now() / 1000);
  const payloadObj: SessionPayload = {
    uid: userId,
    iat: now,
    exp: now + 60 * 60 * 24 * 30, // 30 giorni
  };
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const sig = sign(payload, SECRET);
  return `${payload}.${sig}`;
}

export function verifyUserSessionToken(token?: string | null): SessionPayload | null {
  if (!SECRET || !token) return null;

  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  if (sign(payload, SECRET) !== sig) return null;

  try {
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    if (!obj?.uid || !obj?.exp) return null;
    if (Math.floor(Date.now() / 1000) > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}

export function userCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

export async function getUserIdFromCookie(): Promise<string | null> {
  const c = await cookies();
  const token = c.get(USER_COOKIE_NAME)?.value ?? null;
  const decoded = verifyUserSessionToken(token);
  return decoded?.uid ?? null;
}
