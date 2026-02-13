// src/lib/adminAuth.ts
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/adminSession";

export async function isAdminAuthed(): Promise<boolean> {
  const c = await cookies();
  const token = c.get(ADMIN_COOKIE_NAME)?.value ?? null;
  if (!token) return false;

  try {
    const payload = await verifyAdminSessionToken(token);
    return (payload as any)?.role === "admin";
  } catch {
    return false;
  }
}
