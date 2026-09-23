import "server-only";

import { normalizeEmail } from "@/lib/authFlow";

type AuthUserSummary = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
};

// GoTrue's service-role admin endpoint supports a bounded email filter. Keep this
// server-only and verify the normalized value because the filter is not an identity
// decision by itself; it only selects the compatible email-delivery path.
export async function findAuthUserByEmail(email: string): Promise<AuthUserSummary | null> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing Supabase admin configuration");

  const response = await fetch(
    `${url.replace(/\/$/, "")}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&page=1&per_page=2`,
    {
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error("Auth user lookup unavailable");
  const body = await response.json().catch(() => ({})) as { users?: AuthUserSummary[] };
  const exact = (body.users ?? []).filter((user) => normalizeEmail(user.email) === email);
  if (exact.length > 1) throw new Error("Ambiguous Auth user lookup");
  return exact[0] ?? null;
}
