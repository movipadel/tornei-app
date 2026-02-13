import crypto from "crypto";

export const ADMIN_COOKIE_NAME =
  process.env.ADMIN_COOKIE_NAME ?? "admin_session";

const SECRET = process.env.ADMIN_COOKIE_SECRET;

function sign(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function createAdminSessionToken() {
  if (!SECRET) throw new Error("Missing ADMIN_COOKIE_SECRET");
  const payload = `1.${Date.now()}`;
  const sig = sign(payload, SECRET);
  return `${payload}.${sig}`;
}

export function verifyAdminSessionToken(token?: string | null) {
  if (!SECRET || !token) return false;

  const parts = token.split(".");
  if (parts.length < 3) return false;

  const payload = `${parts[0]}.${parts[1]}`;
  const sig = parts.slice(2).join(".");
  return sign(payload, SECRET) === sig;
}

export function adminCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

export function getAdminTokenFromRequest(req: Request) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookies = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean);

  const name = ADMIN_COOKIE_NAME;
  const hit = cookies.find((c) => c.startsWith(`${name}=`));
  if (!hit) return null;

  return decodeURIComponent(hit.slice(name.length + 1));
}

export function requireAdminFromRequest(req: Request) {
  const token = getAdminTokenFromRequest(req);
  return verifyAdminSessionToken(token);
}
