import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/adminSession";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await guardAdmin(req);
  if (denied) return denied;

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
