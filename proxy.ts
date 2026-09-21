import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { copyResponseCookies, refreshSupabaseAuth } from "@/lib/supabase/authProxy";

const STAFF_COOKIE_NAME = process.env.STAFF_COOKIE_NAME ?? "staff_session";
const encoder = new TextEncoder();

function getSecret() {
  const secret = process.env.STAFF_COOKIE_SECRET?.trim() || process.env.ADMIN_COOKIE_SECRET?.trim();
  return secret ? encoder.encode(secret) : null;
}

async function verifyStaffToken(token?: string) {
  const secret = getSecret();
  if (!secret || !token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const role = String(payload.role ?? "");
    return role === "admin" || role === "staff" ? { role } : null;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const authResponse = await refreshSupabaseAuth(request);
  const { pathname } = request.nextUrl;
  const isAdminPath = pathname.startsWith("/admin");
  const isStaffPath = pathname.startsWith("/staff");
  if (!isAdminPath && !isStaffPath) return authResponse;
  if (pathname.startsWith("/admin/login") || pathname.startsWith("/staff/login")) return authResponse;

  const session = await verifyStaffToken(request.cookies.get(STAFF_COOKIE_NAME)?.value);
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = isStaffPath ? "/staff/login" : "/admin/login";
    url.searchParams.set("next", pathname);
    return copyResponseCookies(authResponse, NextResponse.redirect(url));
  }
  if (isAdminPath && session.role !== "admin") {
    const url = request.nextUrl.clone();
    url.pathname = "/staff";
    return copyResponseCookies(authResponse, NextResponse.redirect(url));
  }
  return authResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
