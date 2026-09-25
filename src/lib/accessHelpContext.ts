import "server-only";

import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

export const ACCESS_CONTEXT_COOKIE = "movi_access_context";
const encoder = new TextEncoder();

export type AccessContext = {
  state: "found" | "name_mismatch" | "multiple_profiles";
  publicUserId?: string;
  normalizedName?: string;
  normalizedPhone?: string;
};

function secretText() {
  const value = process.env.USER_COOKIE_SECRET?.trim() || process.env.STAFF_COOKIE_SECRET?.trim();
  if (!value) throw new Error("Missing USER_COOKIE_SECRET or STAFF_COOKIE_SECRET");
  return value;
}

export async function setAccessContext(value: AccessContext) {
  const token = await new SignJWT(value).setProtectedHeader({ alg: "HS256" })
    .setIssuedAt().setExpirationTime("20m").sign(encoder.encode(secretText()));
  const store = await cookies();
  store.set(ACCESS_CONTEXT_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 20 * 60,
  });
}

export async function getAccessContext(): Promise<AccessContext | null> {
  const token = (await cookies()).get(ACCESS_CONTEXT_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, encoder.encode(secretText()));
    const state = String(payload.state);
    if (!["found", "name_mismatch", "multiple_profiles"].includes(state)) return null;
    return {
      state: state as AccessContext["state"],
      publicUserId: typeof payload.publicUserId === "string" ? payload.publicUserId : undefined,
      normalizedName: typeof payload.normalizedName === "string" ? payload.normalizedName : undefined,
      normalizedPhone: typeof payload.normalizedPhone === "string" ? payload.normalizedPhone : undefined,
    };
  } catch { return null; }
}

export function accessRequestKey(context: AccessContext, kind: string) {
  return createHmac("sha256", secretText()).update([
    "access-help-v1", kind, context.publicUserId ?? "", context.normalizedName ?? "", context.normalizedPhone ?? "",
  ].join("\u001f")).digest("hex");
}
