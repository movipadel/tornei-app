import "server-only";

import { createSupabaseAuthServerClient } from "@/lib/supabase/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getLegacyUserIdFromCookie } from "@/lib/userAuth";

const profileFields =
  "id,full_name,phone,email,gender,privacy_accepted_at,terms_accepted_at,age_confirmed_at,marketing_accepted,marketing_accepted_at";
const internalProfileFields = `${profileFields},auth_migration_state`;

export type MoviIdentityContext = {
  source: "auth" | "legacy" | null;
  auth_user_id: string | null;
  public_user_id: string | null;
  profile: Record<string, unknown> | null;
  migration_state: string;
  conflict_state: string | null;
};

export async function getCurrentMoviUser(): Promise<MoviIdentityContext> {
  const [authResult, legacyId] = await Promise.all([
    createSupabaseAuthServerClient().then((client) => client.auth.getUser()),
    getLegacyUserIdFromCookie(),
  ]);
  const authUser = authResult.data.user && !authResult.error ? authResult.data.user : null;
  const admin = supabaseAdmin();

  const [authProfileResult, legacyProfileResult, onboardingResult] = await Promise.all([
    authUser
      ? admin.from("users").select(internalProfileFields).eq("auth_user_id", authUser.id).eq("identity_status", "active").maybeSingle()
      : Promise.resolve({ data: null }),
    legacyId
      ? admin.from("users").select(internalProfileFields)
        .eq("id", legacyId)
        .eq("identity_status", "active")
        .is("auth_user_id", null)
        .in("auth_migration_state", ["legacy", "activation_pending", "review_required"])
        .maybeSingle()
      : Promise.resolve({ data: null }),
    authUser
      ? admin.from("user_auth_onboarding").select("state").eq("auth_user_id", authUser.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const authProfile = authProfileResult.data as Record<string, unknown> | null;
  const legacyProfile = legacyProfileResult.data as Record<string, unknown> | null;
  const authProfileId = authProfile?.id as string | undefined;
  const legacyProfileId = legacyProfile?.id as string | undefined;
  const publicProfile = (profile: Record<string, unknown> | null) => profile
    ? Object.fromEntries(Object.entries(profile).filter(([key]) => key !== "auth_migration_state"))
    : null;

  if (authUser) {
    if (authProfileId && legacyProfileId && authProfileId !== legacyProfileId) {
      return {
        source: null,
        auth_user_id: authUser.id,
        public_user_id: null,
        profile: null,
        migration_state: "conflict",
        conflict_state: "auth_legacy_profile_mismatch",
      };
    }
    return {
      source: "auth",
      auth_user_id: authUser.id,
      public_user_id: authProfileId ?? null,
      profile: publicProfile(authProfile),
      migration_state: authProfileId
        ? "linked"
        : ((onboardingResult.data as { state?: string } | null)?.state ?? "pending_activation"),
      conflict_state: null,
    };
  }

  return {
    source: legacyProfile ? "legacy" : null,
    auth_user_id: null,
    public_user_id: legacyProfileId ?? null,
    profile: publicProfile(legacyProfile),
    migration_state: legacyProfile ? String(legacyProfile.auth_migration_state ?? "legacy") : "anonymous",
    conflict_state: null,
  };
}
