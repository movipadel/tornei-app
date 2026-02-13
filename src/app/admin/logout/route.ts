import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const cookieName = process.env.ADMIN_COOKIE_NAME ?? "admin_session";

  const url = new URL(req.url);
  const res = NextResponse.redirect(new URL("/", url.origin));

  res.cookies.set(cookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return res;
}
