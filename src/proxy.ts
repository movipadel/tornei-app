import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { copyResponseCookies, refreshSupabaseAuth } from "@/lib/supabase/authProxy";
import { resolveOperatorFromSession } from "@/lib/operatorResolver";
import { delegatedAdminPagePermission } from "@/lib/operatorRouteAccess";

// This project uses src/app, so Next 16 discovers the proxy at src/proxy.ts.
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
    const sid = String(payload.sid ?? "");
    return sid && (role === "admin" || role === "staff") ? { sid, role } : null;
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
  let operator = null;
  try {
    operator = session ? await resolveOperatorFromSession(session) : null;
  } catch (error) {
    console.error("Operator proxy resolution failed", error);
  }
  if (!operator) {
    const url = request.nextUrl.clone();
    url.pathname = isStaffPath ? "/staff/login" : "/admin/login";
    url.searchParams.set("next", pathname);
    return copyResponseCookies(authResponse, NextResponse.redirect(url));
  }
  if (isAdminPath && operator.role !== "admin" && !delegatedAdminPagePermission(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/staff";
    return copyResponseCookies(authResponse, NextResponse.redirect(url));
  }
  return authResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
