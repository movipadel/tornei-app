// src/lib/adminGuard.ts
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/adminSession";

export async function guardAdmin(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|; )${ADMIN_COOKIE_NAME}=([^;]*)`)
  );

  if (!match) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = decodeURIComponent(match[1]);

  try {
    const payload = await verifyAdminSessionToken(token);
    if ((payload as any).role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null; // OK
  } catch {
    // token invalido/scaduto
    const res = NextResponse.json({ error: "Forbidden" }, { status: 403 });
    res.cookies.set(ADMIN_COOKIE_NAME, "", { path: "/", maxAge: 0 });
    return res;
  }
}
