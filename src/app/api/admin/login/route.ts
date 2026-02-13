import { NextResponse } from "next/server";
import {
  createAdminSessionToken,
  adminCookieOptions,
  ADMIN_COOKIE_NAME,
} from "@/lib/adminSession";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Password errata" }, { status: 401 });
  }

  const token = createAdminSessionToken();

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, token, adminCookieOptions());

  return res;
}
