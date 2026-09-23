import "server-only";

import { normalizeEmail } from "@/lib/authFlow";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type OnboardingFlow = "activation" | "signup";
type ResolutionData = { state?: string; [key: string]: unknown };

export type OnboardingResolution = {
  flow: OnboardingFlow;
  state: string;
  data: ResolutionData;
};

type VerifiedAuthUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
};

async function runResolutionRpc(flow: OnboardingFlow, authUserId: string): Promise<OnboardingResolution> {
  const rpc = flow === "signup" ? "finalize_verified_auth_signup" : "resolve_and_link_verified_auth_user";
  const { data, error } = await supabaseAdmin().rpc(rpc, { p_auth_user_id: authUserId });
  if (error) throw error;
  const result = (data ?? {}) as ResolutionData;
  return { flow, state: String(result.state ?? "conflict"), data: result };
}

export async function resolveVerifiedAuthOnboarding(
  authUser: VerifiedAuthUser,
  fallbackFlow?: OnboardingFlow | null,
): Promise<OnboardingResolution> {
  if (!authUser.email_confirmed_at) {
    return { flow: fallbackFlow ?? "signup", state: "pending_verification", data: { state: "pending_verification" } };
  }

  const admin = supabaseAdmin();
  const [{ data: draft, error: draftError }, { data: linkedProfile, error: linkedError }] = await Promise.all([
    admin.from("user_auth_onboarding")
      .select("flow,state,normalized_email,normalized_phone,linked_public_user_id")
      .eq("auth_user_id", authUser.id)
      .maybeSingle(),
    admin.from("users")
      .select("id")
      .eq("auth_user_id", authUser.id)
      .eq("identity_status", "active")
      .maybeSingle(),
  ]);
  if (draftError) throw draftError;
  if (linkedError) throw linkedError;

  const draftFlow = draft?.flow === "activation" || draft?.flow === "signup" ? draft.flow : null;
  const flow = draftFlow ?? fallbackFlow ?? "signup";

  // The Auth link is already authoritative. Repair only the private onboarding
  // marker so callback and resume replays converge without touching business rows.
  if (linkedProfile?.id) {
    if (draft) {
      const { error } = await admin.from("user_auth_onboarding").update({
        state: "linked",
        match_count: 1,
        linked_public_user_id: linkedProfile.id,
        updated_at: new Date().toISOString(),
      }).eq("auth_user_id", authUser.id);
      if (error) throw error;
    }
    return { flow, state: "linked", data: { state: "linked", linked_public_user_id: linkedProfile.id } };
  }

  if (!draft) return runResolutionRpc(flow, authUser.id);
  if (flow === "activation") return runResolutionRpc("activation", authUser.id);

  const verifiedEmail = normalizeEmail(authUser.email);
  if (!verifiedEmail || verifiedEmail !== normalizeEmail(draft.normalized_email)) {
    const { error } = await admin.from("user_auth_onboarding").update({
      state: "conflict",
      linked_public_user_id: null,
      updated_at: new Date().toISOString(),
    }).eq("auth_user_id", authUser.id);
    if (error) throw error;
    return { flow: "signup", state: "conflict", data: { state: "conflict" } };
  }

  // Stage 5A preflight is the existing service-only canonical phone resolver.
  // It returns a profile only when the normalized phone identifies one eligible,
  // active, unlinked legacy row. Name is deliberately never used as proof.
  const { data: preflightData, error: preflightError } = await admin.rpc("legacy_user_auth_migration_preflight", {
    p_phone: draft.normalized_phone,
  });
  if (preflightError) throw preflightError;
  const preflight = (preflightData ?? {}) as { state?: string; public_user_id?: string | null };

  if (preflight.state === "legacy_allowed" && preflight.public_user_id) {
    const { data: candidate, error: candidateError } = await admin.from("users")
      .select("id,email,identity_status,auth_user_id,auth_migration_state")
      .eq("id", preflight.public_user_id)
      .maybeSingle();
    if (candidateError) throw candidateError;

    const eligibleState = candidate?.auth_migration_state === "legacy" || candidate?.auth_migration_state === "activation_pending";
    if (candidate?.identity_status === "active"
      && !candidate.auth_user_id
      && eligibleState
      && normalizeEmail(candidate.email) === verifiedEmail) {
      // The preflight proved unique normalized phone and this comparison proves
      // the same row owns the verified normalized email. The certified resolver
      // rechecks verified email, uniqueness, link conflicts and transactional locks.
      return runResolutionRpc("activation", authUser.id).then((result) => ({ ...result, flow: "signup" }));
    }
  }

  // Zero candidates creates once. Email/phone collisions, multiple profiles,
  // merged rows and links owned by another Auth identity remain fail-closed in
  // the existing transactional signup finalizer.
  return runResolutionRpc("signup", authUser.id);
}
