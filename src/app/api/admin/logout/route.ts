import { NextResponse } from "next/server";
import { STAFF_COOKIE_NAME } from "@/lib/staffSession";
import { revokePushOnLogout } from '@/lib/pushApi';

export const runtime = "nodejs";

export async function POST() {
  await revokePushOnLogout('staff');
  const res = NextResponse.json({ ok: true });

  res.cookies.set(STAFF_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
  });

  return res;
}
