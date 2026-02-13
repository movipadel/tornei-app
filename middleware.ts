import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = process.env.ADMIN_COOKIE_NAME ?? "admin_session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Solo area admin UI
  if (!pathname.startsWith("/admin")) return NextResponse.next();

  // Lascia libero login/logout
  if (pathname === "/admin/login" || pathname === "/admin/logout") {
    return NextResponse.next();
  }

  // Se manca cookie -> vai a login
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
