import { getCurrentOperator, guardOperatorPermission } from "@/lib/operatorAuthorization";
import { editorialJson } from "@/lib/padelleriaServer";
import { computeMovibackEligibility } from "@/lib/movibackEligibility";
import { moviLevelLabel } from "@/lib/playerProfile";
import { computeGameProfileCompleteness } from "@/lib/playerProfileCompleteness";
import { customerAuthAccess, customerHubMatchesSearch } from "@/lib/customerHub";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
const statuses = new Set(["active", "archived", "merged", "all"]);
const accounts = new Set(["all", "linked", "unlinked"]);
const movibackFilters = new Set(["all", "member", "active", "grace_period", "standby", "pending_review", "none"]);
const profileFilters = new Set(["all", "complete", "partial", "incomplete"]);
const REGISTRY_CAP = 5000;

export async function GET(req: Request) {
  const denied = await guardOperatorPermission("players.manage");
  if (denied) return denied;
  const operator = await getCurrentOperator();
  const sb = supabaseAdmin();

  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  const status = params.get("status") ?? "active";
  const account = params.get("account") ?? "all";
  const moviback = params.get("moviback") ?? "all";
  const profile = params.get("profile") ?? "all";
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(params.get("limit") ?? "50", 10) || 50));
  if (q.length > 100 || !statuses.has(status) || !accounts.has(account) || !movibackFilters.has(moviback) || !profileFilters.has(profile)) {
    return editorialJson({ error: "Filtri non validi" }, 400);
  }

  // Customer Hub is customer-centric: the two bounded roots are loaded once,
  // then enriched in batches. No Auth link is required and no player is created.
  const [players, activeAccounts] = await Promise.all([
    sb.from("player_identities")
      .select("id,full_name,normalized_phone,gender,account_user_id,status,updated_at,merged_into_player_id")
      .order("full_name").order("id").limit(REGISTRY_CAP),
    sb.from("users")
      .select("id,full_name,phone,email,gender,identity_status,auth_migration_state,auth_user_id,created_at")
      .eq("identity_status", "active")
      .order("full_name").order("id").limit(REGISTRY_CAP),
  ]);
  if (players.error || activeAccounts.error) return editorialJson({ error: "Registro clienti non disponibile" }, 503);

  const allPlayers = players.data ?? [];
  const accountRows = activeAccounts.data ?? [];
  const accountById = new Map(accountRows.map((item) => [item.id, item]));
  const linkedAccountIds = new Set(allPlayers
    .filter((player) => player.status !== "merged" && player.account_user_id)
    .map((player) => player.account_user_id as string));

  const playerRows = allPlayers.filter((player) => {
    if (status !== "all" && player.status !== status) return false;
    if (account === "linked" && !player.account_user_id) return false;
    if (account === "unlinked" && player.account_user_id) return false;
    const linkedAccount = player.account_user_id ? accountById.get(player.account_user_id) : null;
    return customerHubMatchesSearch(q, [player.full_name, player.normalized_phone, linkedAccount?.full_name, linkedAccount?.phone, linkedAccount?.email]);
  });
  const accountOnlyRows = accountRows.filter((item) => {
    if (linkedAccountIds.has(item.id) || account === "unlinked") return false;
    if (status !== "active" && status !== "all") return false;
    return customerHubMatchesSearch(q, [item.full_name, item.phone, item.email]);
  });

  const ids = playerRows.map((player) => player.id);
  const userIds = [...new Set([
    ...playerRows.map((player) => player.account_user_id).filter(Boolean) as string[],
    ...accountOnlyRows.map((item) => item.id),
  ])];
  const [profiles, adminProfiles, availability, memberships, certificates, cases] = await Promise.all([
    ids.length ? sb.from("player_profiles").select("player_identity_id,descriptive_level,preferred_clubs,available_other_clubs,preferred_match_types,available_last_minute").in("player_identity_id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? sb.from("player_admin_profiles").select("player_identity_id,movi_level").in("player_identity_id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? sb.from("player_profile_availability").select("player_identity_id").in("player_identity_id", ids) : Promise.resolve({ data: [], error: null }),
    userIds.length ? sb.from("loyalty_memberships").select("id,user_id,status,tax_code,approved_at,created_at,health_data_consent_at").in("user_id", userIds) : Promise.resolve({ data: [], error: null }),
    userIds.length ? sb.from("medical_certificates").select("id,user_id,status,expiry_date,uploaded_at").in("user_id", userIds).order("uploaded_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    operator?.role === "admin" && ids.length ? sb.from("player_identity_cases").select("id,player_ids,status").in("status", ["open", "in_review"]).overlaps("player_ids", ids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (profiles.error || adminProfiles.error || availability.error || memberships.error || certificates.error || cases.error) {
    return editorialJson({ error: "Riepilogo Customer Hub non disponibile" }, 503);
  }

  const shared = new Map((profiles.data ?? []).map((item) => [item.player_identity_id, item]));
  const numeric = new Map((adminProfiles.data ?? []).map((item) => [item.player_identity_id, item.movi_level === null ? null : Number(item.movi_level)]));
  const availabilityCounts = new Map<string, number>();
  for (const item of availability.data ?? []) availabilityCounts.set(item.player_identity_id, (availabilityCounts.get(item.player_identity_id) ?? 0) + 1);
  type MembershipRow = NonNullable<typeof memberships.data>[number];
  type CertificateRow = NonNullable<typeof certificates.data>[number];
  const membershipsByUser = new Map<string, MembershipRow[]>();
  for (const membership of memberships.data ?? []) membershipsByUser.set(membership.user_id, [...(membershipsByUser.get(membership.user_id) ?? []), membership]);
  const certificatesByUser = new Map<string, CertificateRow[]>();
  for (const certificate of certificates.data ?? []) certificatesByUser.set(certificate.user_id, [...(certificatesByUser.get(certificate.user_id) ?? []), certificate]);
  const conflictIds = new Set<string>();
  for (const item of cases.data ?? []) for (const playerId of item.player_ids ?? []) conflictIds.add(playerId);

  const playerResults = playerRows.map((player) => {
    const level = numeric.get(player.id) ?? null;
    const sharedProfile = shared.get(player.id);
    const memberRows = player.account_user_id ? membershipsByUser.get(player.account_user_id) ?? [] : [];
    const eligibility = computeMovibackEligibility({ memberships: memberRows, certificates: player.account_user_id ? certificatesByUser.get(player.account_user_id) ?? [] : [] });
    const gameProfile = computeGameProfileCompleteness({
      hasProfile: Boolean(sharedProfile),
      descriptiveLevel: sharedProfile?.descriptive_level ?? null,
      moviLevel: level,
      preferredClubs: sharedProfile?.preferred_clubs ?? [],
      availableOtherClubs: sharedProfile?.available_other_clubs ?? null,
      availabilityCount: availabilityCounts.get(player.id) ?? 0,
      preferredMatchTypes: sharedProfile?.preferred_match_types ?? [],
      availableLastMinute: sharedProfile?.available_last_minute ?? null,
    });
    const accountData = player.account_user_id ? accountById.get(player.account_user_id) : null;
    return {
      kind: "player" as const,
      result_key: `player:${player.id}`,
      player_identity_id: player.id,
      ...player,
      email: accountData?.email ?? null,
      auth_access: accountData ? customerAuthAccess(accountData.auth_migration_state, Boolean(accountData.auth_user_id)) : customerAuthAccess(null, false),
      descriptive_level: sharedProfile?.descriptive_level ?? null,
      movi_level: level,
      movi_level_label: moviLevelLabel(level),
      moviback_state: memberRows.length ? eligibility.eligibility_state : "none",
      compliance_badge: memberRows.length ? eligibility.certificate_state : "none",
      identity_warning: conflictIds.has(player.id),
      game_profile: gameProfile,
    };
  });

  const accountOnlyResults = accountOnlyRows.map((item) => {
    const memberRows = membershipsByUser.get(item.id) ?? [];
    const eligibility = computeMovibackEligibility({ memberships: memberRows, certificates: certificatesByUser.get(item.id) ?? [], accountActive: true });
    return {
      kind: "account_only" as const,
      result_key: `account:${item.id}`,
      player_identity_id: null,
      account_user_id: item.id,
      full_name: item.full_name,
      normalized_phone: item.phone,
      email: item.email,
      gender: item.gender,
      status: "active",
      merged_into_player_id: null,
      auth_access: customerAuthAccess(item.auth_migration_state, Boolean(item.auth_user_id)),
      descriptive_level: null,
      movi_level: null,
      movi_level_label: null,
      moviback_state: memberRows.length ? eligibility.eligibility_state : "none",
      compliance_badge: memberRows.length ? eligibility.certificate_state : "none",
      identity_warning: false,
      game_profile: null,
    };
  });

  const enriched = [...playerResults, ...accountOnlyResults]
    .filter((item) => moviback === "all" || (moviback === "member" ? item.moviback_state !== "none" : item.moviback_state === moviback))
    .filter((item) => profile === "all" || (item.kind === "account_only" ? profile === "incomplete" : item.game_profile.status === profile))
    .sort((left, right) => left.full_name.localeCompare(right.full_name, "it") || left.result_key.localeCompare(right.result_key));

  const from = (page - 1) * limit;
  const data = enriched.slice(from, from + limit);
  return editorialJson({ data, page, limit, total: enriched.length, has_more: from + limit < enriched.length, query_required: false });
}
