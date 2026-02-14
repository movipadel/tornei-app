import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/adminSession";

export async function guardAdmin(_req: Request) {
  const c = await cookies();
  const token = c.get(ADMIN_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const payload = await verifyAdminSessionToken(token);
    if ((payload as any).role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
  } catch {
    // Non cancelliamo il cookie qui: evitiamo logout “a cascata” per un singolo errore
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
