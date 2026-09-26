import { guardAdmin } from "@/lib/adminGuard";
import { getStaffSessionFromCookie } from "@/lib/staffSession";
import { editorialJson } from "@/lib/padelleriaServer";
import { computeMovibackEligibility } from "@/lib/movibackEligibility";
import { moviLevelLabel } from "@/lib/playerProfile";
import { computeGameProfileCompleteness } from "@/lib/playerProfileCompleteness";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
const statuses = new Set(["active", "archived", "merged", "all"]);
const accounts = new Set(["all", "linked", "unlinked"]);
const movibackFilters = new Set(["all", "member", "active", "grace_period", "standby", "pending_review", "none"]);
const profileFilters = new Set(["all", "complete", "partial", "incomplete"]);

export async function GET(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const session = await getStaffSessionFromCookie();
  const sb = supabaseAdmin();
  const active = await sb.rpc("player_identity_admin", { p_actor: session!.sid });
  if (active.error) return editorialJson({ error: "Admin attivo richiesto" }, 403);

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

  let query = sb.from("player_identities")
    .select("id,full_name,normalized_phone,gender,account_user_id,status,updated_at,merged_into_player_id")
    .order("full_name").order("id").limit(5000);
  if (status !== "all") query = query.eq("status", status);
  if (account === "linked") query = query.not("account_user_id", "is", null);
  else if (account === "unlinked") query = query.is("account_user_id", null);
  if (q) {
    if (/^[+\d\s()-]+$/.test(q)) query = query.ilike("normalized_phone", `%${q.replace(/[^+\d]/g, "")}%`);
    else query = query.ilike("full_name", `%${q.replace(/[%_]/g, "")}%`);
  }
  const players = await query;
  if (players.error) return editorialJson({ error: "Registro giocatori non disponibile" }, 503);
  const rows = players.data ?? [];
  const ids = rows.map((player) => player.id);
  const userIds = rows.map((player) => player.account_user_id).filter(Boolean) as string[];
  const [profiles, adminProfiles, availability, memberships, certificates, cases] = await Promise.all([
    ids.length ? sb.from("player_profiles").select("player_identity_id,descriptive_level,preferred_clubs,available_other_clubs,preferred_match_types,available_last_minute").in("player_identity_id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? sb.from("player_admin_profiles").select("player_identity_id,movi_level").in("player_identity_id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? sb.from("player_profile_availability").select("player_identity_id").in("player_identity_id", ids) : Promise.resolve({ data: [], error: null }),
    userIds.length ? sb.from("loyalty_memberships").select("id,user_id,status,tax_code,health_data_consent_at").in("user_id", userIds) : Promise.resolve({ data: [], error: null }),
    userIds.length ? sb.from("medical_certificates").select("id,user_id,status,expiry_date,uploaded_at").in("user_id", userIds).order("uploaded_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ids.length ? sb.from("player_identity_cases").select("id,player_ids,status").in("status", ["open", "in_review"]).overlaps("player_ids", ids) : Promise.resolve({ data: [], error: null }),
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

  const enriched = rows.map((player) => {
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
    return {
      ...player,
      descriptive_level: sharedProfile?.descriptive_level ?? null,
      movi_level: level,
      movi_level_label: moviLevelLabel(level),
      moviback_state: memberRows.length ? eligibility.eligibility_state : "none",
      compliance_badge: memberRows.length ? eligibility.certificate_state : "none",
      identity_warning: conflictIds.has(player.id),
      game_profile: gameProfile,
    };
  }).filter((player) => moviback === "all" || (moviback === "member" ? player.moviback_state !== "none" : player.moviback_state === moviback))
    .filter((player) => profile === "all" || player.game_profile.status === profile);

  const from = (page - 1) * limit;
  const data = enriched.slice(from, from + limit);
  return editorialJson({ data, page, limit, total: enriched.length, has_more: from + limit < enriched.length, query_required: false });
}
