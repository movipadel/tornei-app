import type { supabaseAdmin } from "@/lib/supabaseAdmin";

type AdminDb = ReturnType<typeof supabaseAdmin>;
type DbError = { code?: string; message?: string } | null;
type MediaRpc = "current_user_media_consent" | "record_user_media_consent" | "consume_user_media_signup_intent";

export function mediaConsentRpcMissing(error: DbError, name: MediaRpc): boolean {
  return error?.code === "PGRST202" &&
    new RegExp(`(?:public\\.)?${name}\\s*\\(`, "i").test(error.message ?? "");
}

export function mediaConsentViewMissing(error: DbError): boolean {
  return error?.code === "PGRST205" && /\buser_media_consent_current\b/i.test(error.message ?? "");
}

// The 120000 migration installs this RPC. A missing RPC before that migration
// must not interrupt the existing Auth activation and profile-linking flow.
export async function consumeMediaConsentIntentIfAvailable(sb: AdminDb, authUserId: string): Promise<void> {
  const result = await sb.rpc("consume_user_media_signup_intent", { p_auth_user_id: authUserId });
  if (result.error && !mediaConsentRpcMissing(result.error, "consume_user_media_signup_intent")) throw result.error;
}

export async function mediaConsentSchemaAvailable(sb: AdminDb): Promise<boolean> {
  const result = await sb.rpc("current_user_media_consent", { p_user_id: "00000000-0000-0000-0000-000000000000" });
  if (mediaConsentRpcMissing(result.error, "current_user_media_consent")) return false;
  if (result.error) throw result.error;
  const intents = await sb.from("user_media_signup_intents").select("auth_user_id").limit(0);
  if (intents.error?.code === "PGRST205" && /\buser_media_signup_intents\b/i.test(intents.error.message)) return false;
  if (intents.error) throw intents.error;
  return true;
}
