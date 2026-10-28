import "server-only";
import { computeMovibackEligibility } from "@/lib/movibackEligibility";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function readMovibackEligibility(options: { userId?: string; membershipId?: string; currentDate?: string; membershipStatusOverride?: string }) {
  const sb = supabaseAdmin();
  let query = sb.from("loyalty_memberships").select("id,user_id,status,tax_code,approved_at,created_at,health_data_consent_at");
  if (options.membershipId) query = query.eq("id", options.membershipId);
  else query = query.eq("user_id", options.userId!);
  const membershipResult = await query;
  if (membershipResult.error) throw membershipResult.error;
  const memberships = (membershipResult.data ?? []).map((membership) => options.membershipStatusOverride ? { ...membership, status: options.membershipStatusOverride } : membership);
  const userId = options.userId ?? memberships[0]?.user_id ?? null;
  if (!userId) return computeMovibackEligibility({ memberships: [], certificates: [], currentDate: options.currentDate });
  const [certificatesResult, userResult] = await Promise.all([
    sb.from("medical_certificates").select("id,status,expiry_date,uploaded_at").eq("user_id", userId).order("uploaded_at", { ascending: false }),
    sb.from("users").select("identity_status").eq("id", userId).maybeSingle(),
  ]);
  if (certificatesResult.error) throw certificatesResult.error;
  if (userResult.error) throw userResult.error;
  return computeMovibackEligibility({
    memberships,
    certificates: certificatesResult.data ?? [],
    currentDate: options.currentDate,
    accountActive: !userResult.data?.identity_status || userResult.data.identity_status === "active",
  });
}
