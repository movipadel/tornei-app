import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { getStaffSessionFromCookie } from "@/lib/staffSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const countDomains = [
  ["communication_user_states", "user_id", "communications"],
  ["league_audit_events", "actor_user_id", "league_audit_events"],
  ["league_lineups", "submitted_by_user_id", "lineups_submitted"],
  ["league_result_contests", "opened_by_user_id", "contests_opened"],
  ["league_result_submissions", "submitted_by_user_id", "results_submitted"],
  ["league_team_players", "user_id", "league_rosters"],
  ["loyalty_memberships", "user_id", "moviback_memberships"],
  ["medical_certificates", "user_id", "medical_certificates"],
  ["store_orders", "user_id", "store_orders"],
  ["tournament_registrations", "user_id", "tournament_registrations"],
  ["tournament_run_participants", "user_id", "tournament_participants"],
] as const;

function normalizedPhone(value: string | null) {
  if (!value) return null;
  let phone = value.trim().replace(/[\s().-]+/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (/^3\d{9}$/.test(phone)) return `+39${phone}`;
  if (/^\+\d{8,15}$/.test(phone)) return phone;
  return null;
}

export async function GET(request: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const sb = supabaseAdmin();
  const params = new URL(request.url).searchParams;
  const stateFilter = params.get("state");
  const confidenceFilter = params.get("confidence");
  const migrationStateFilter = params.get("migration_state");
  const [groupsResult, summaryResult, scanResult] = await Promise.all([
    sb.from("user_duplicate_review_groups")
      .select("id,signal_type,signal_value,confidence,state,recommended_user_id,canonical_user_id,warning_flags,review_note,created_at,updated_at,is_stale,stale_reason,recommendation_reasons,review_config,candidate_fingerprint")
      .order("updated_at", { ascending: false }),
    sb.rpc("user_migration_summary"),
    sb.from("user_duplicate_scan_runs").select("id,status,started_at,completed_at,groups_discovered,groups_stale").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (groupsResult.error) return NextResponse.json({ error: groupsResult.error.message }, { status: 500 });
  let groups = groupsResult.data ?? [];
  if (stateFilter) groups = groups.filter((group) => group.state === stateFilter);
  if (confidenceFilter) groups = groups.filter((group) => group.confidence === confidenceFilter);
  const groupIds = groups.map((group) => group.id);
  const { data: members, error: membersError } = groupIds.length
    ? await sb.from("user_duplicate_review_members").select("group_id,user_id,included").in("group_id", groupIds)
    : { data: [], error: null };
  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });
  const userIds = [...new Set((members ?? []).map((member) => member.user_id))];
  const { data: profiles, error: profileError } = userIds.length
    ? await sb.from("users").select("id,full_name,phone,email,gender,created_at,updated_at,auth_user_id,identity_status,privacy_accepted_at,terms_accepted_at,age_confirmed_at,marketing_accepted,marketing_accepted_at").in("id", userIds)
    : { data: [], error: null };
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  let migrationUsersQuery = sb.from("users")
    .select("id,full_name,email,phone,auth_user_id,auth_migration_state,identity_status,updated_at")
    .order("updated_at", { ascending: false }).limit(500);
  if (migrationStateFilter) migrationUsersQuery = migrationUsersQuery.eq("auth_migration_state", migrationStateFilter);
  const { data: migrationUsers, error: migrationUsersError } = await migrationUsersQuery;
  if (migrationUsersError) return NextResponse.json({ error: migrationUsersError.message }, { status: 500 });

  const counts = new Map<string, Record<string, number>>();
  await Promise.all(userIds.flatMap((userId) => countDomains.map(async ([table, column, label]) => {
    const { count } = await sb.from(table).select("id", { head: true, count: "exact" }).eq(column, userId);
    counts.set(userId, { ...(counts.get(userId) ?? {}), [label]: count ?? 0 });
  })));
  await Promise.all(userIds.map(async (userId) => {
    const { count } = await sb.from("store_orders").select("id", { head: true, count: "exact" })
      .eq("user_id", userId).not("status", "in", "(delivered,cancelled)");
    counts.set(userId, { ...(counts.get(userId) ?? {}), open_store_orders: count ?? 0 });
  }));

  const { data: memberships } = userIds.length
    ? await sb.from("loyalty_memberships").select("id,user_id,status,membership_type").in("user_id", userIds)
    : { data: [] };
  const membershipIds = (memberships ?? []).map((membership) => membership.id);
  const balances = new Map<string, number>();
  if (membershipIds.length) {
    const { data: transactions } = await sb.from("loyalty_transactions").select("membership_id,points_delta").in("membership_id", membershipIds);
    for (const transaction of transactions ?? []) balances.set(transaction.membership_id, (balances.get(transaction.membership_id) ?? 0) + transaction.points_delta);
  }
  const { data: players } = userIds.length
    ? await sb.from("league_team_players").select("id,user_id,team_id,is_active").in("user_id", userIds)
    : { data: [] };
  const teamIds = [...new Set((players ?? []).map((player) => player.team_id))];
  const { data: teams } = teamIds.length
    ? await sb.from("league_teams").select("id,name,captain_player_id,season_id").in("id", teamIds)
    : { data: [] };
  const teamMap = new Map((teams ?? []).map((team) => [team.id, team]));
  const seasonIds = [...new Set((teams ?? []).map((team) => team.season_id))];
  const { data: phases } = seasonIds.length
    ? await sb.from("league_phases").select("season_id,code,name,status,sequence").in("season_id", seasonIds).order("sequence")
    : { data: [] };

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, {
    id: profile.id,
    full_name: profile.full_name,
    phone: profile.phone,
    email: profile.email,
    normalized_email: profile.email?.trim().toLowerCase() || null,
    normalized_phone: normalizedPhone(profile.phone),
    gender: profile.gender,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
    auth_linked: Boolean(profile.auth_user_id),
    auth_state: profile.auth_user_id ? "linked" : "unlinked",
    identity_status: profile.identity_status,
    consents: {
      privacy: profile.privacy_accepted_at,
      terms: profile.terms_accepted_at,
      age: profile.age_confirmed_at,
      marketing: profile.marketing_accepted,
      marketing_at: profile.marketing_accepted_at,
    },
    reference_counts: counts.get(profile.id) ?? {},
    moviback: (memberships ?? []).filter((membership) => membership.user_id === profile.id).map((membership) => ({
      id: membership.id,
      status: membership.status,
      membership_type: membership.membership_type,
      ledger_balance: balances.get(membership.id) ?? 0,
    })),
    monday_league: (players ?? []).filter((player) => player.user_id === profile.id).map((player) => ({
      team_id: player.team_id,
      team_name: teamMap.get(player.team_id)?.name ?? "Squadra",
      active: player.is_active,
      captain: teamMap.get(player.team_id)?.captain_player_id === player.id,
      phases: (phases ?? []).filter((phase) => phase.season_id === teamMap.get(player.team_id)?.season_id)
        .map((phase) => ({ code: phase.code, name: phase.name, status: phase.status })),
    })),
  }]));

  return NextResponse.json({
    summary: summaryResult.data ?? null,
    latest_scan: scanResult.data ?? null,
    migration_users: (migrationUsers ?? []).map(({ auth_user_id, ...user }) => ({ ...user, auth_linked: Boolean(auth_user_id) })),
    data: groups.map((group) => ({
      ...group,
      members: (members ?? []).filter((member) => member.group_id === group.id).map((member) => ({
        included: member.included,
        profile: profileMap.get(member.user_id),
      })),
    })),
  });
}

export async function POST(request: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const session = await getStaffSessionFromCookie();
  const body = await request.json().catch(() => ({}));
  const sb = supabaseAdmin();
  if (body.action === "scan" || body.action === "refresh") {
    const { data, error } = await sb.rpc("run_user_duplicate_scan", { p_actor_staff_id: session!.sid });
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ data });
  }
  const groupId = String(body.group_id ?? "");
  const state = String(body.state ?? "");
  if (!groupId || !["pending_review", "approved", "rejected", "conflict", "manual_only"].includes(state)) {
    return NextResponse.json({ error: "Revisione non valida" }, { status: 400 });
  }
  const includedIds = Array.isArray(body.included_user_ids) ? body.included_user_ids.map(String) : [];
  const fieldWinners = body.field_winners && typeof body.field_winners === "object" ? body.field_winners : {};
  const { data, error } = await sb.rpc("save_user_duplicate_review_decision", {
    p_group_id: groupId,
    p_state: state,
    p_canonical_user_id: body.canonical_user_id ? String(body.canonical_user_id) : null,
    p_source_user_id: body.source_user_id ? String(body.source_user_id) : null,
    p_included_user_ids: includedIds,
    p_field_winners: fieldWinners,
    p_note: String(body.review_note ?? ""),
    p_actor_staff_id: session!.sid,
  });
  return error ? NextResponse.json({ error: error.message }, { status: 409 }) : NextResponse.json({ data });
}
