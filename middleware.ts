import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const STAFF_COOKIE_NAME = process.env.STAFF_COOKIE_NAME ?? "staff_session";

const encoder = new TextEncoder();

function getSecret() {
  const secret =
    process.env.STAFF_COOKIE_SECRET?.trim() ||
    process.env.ADMIN_COOKIE_SECRET?.trim();

  if (!secret) return null;

  return encoder.encode(secret);
}

async function verifyStaffToken(token?: string) {
  const secret = getSecret();
  if (!secret || !token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    const role = String(payload.role ?? "");

    if (role !== "admin" && role !== "staff") return null;

    return {
      role,
    };
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminPath = pathname.startsWith("/admin");
  const isStaffPath = pathname.startsWith("/staff");

  if (!isAdminPath && !isStaffPath) return NextResponse.next();

  if (pathname.startsWith("/admin/login")) return NextResponse.next();
  if (pathname.startsWith("/staff/login")) return NextResponse.next();

  const token = req.cookies.get(STAFF_COOKIE_NAME)?.value;
  const session = await verifyStaffToken(token);

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = isStaffPath ? "/staff/login" : "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAdminPath && session.role !== "admin") {
    const url = req.nextUrl.clone();
    url.pathname = "/staff";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/staff/:path*"],
};