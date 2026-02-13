import "server-only";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from "./adminSession";

export async function isAdminAuthed(): Promise<boolean> {
  const c = await cookies();
  const token = c.get(ADMIN_COOKIE_NAME)?.value ?? null;
  return verifyAdminSessionToken(token);
}
