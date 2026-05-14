import { getStaffSessionFromCookie } from "@/lib/staffSession";

export async function getStoreEconomicsAccess() {
  const session = await getStaffSessionFromCookie();

  if (!session || session.role !== "admin") {
    return { allowed: false, session: null };
  }

  const email = String(session.email || "").trim().toLowerCase();

  const allowedEmails = String(process.env.STORE_ECONOMICS_ADMIN_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  return {
    allowed: !!email && allowedEmails.includes(email),
    session,
  };
}