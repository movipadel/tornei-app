import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { getStaffSessionFromCookie } from "@/lib/staffSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const countDomains = [
  ["communication_user_states", "user_id", "communications"],
  ["league_team_players", "user_id", "league_rosters"],
  ["loyalty_memberships", "user_id", "moviback_memberships"],
  ["medical_certificates", "user_id", "medical_certificates"],
  ["store_orders", "user_id", "store_orders"],
  ["tournament_registrations", "user_id", "tournament_registrations"],
  ["tournament_run_participants", "user_id", "tournament_participants"],
] as const;

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;
  const sb = supabaseAdmin();
  const { data: groups, error } = await sb.from("user_duplicate_review_groups")
    .select("id,signal_type,signal_value,confidence,state,recommended_user_id,canonical_user_id,warning_flags,review_note,created_at,updated_at")
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const groupIds = (groups ?? []).map((group) => group.id);
  const { data: members } = groupIds.length
    ? await sb.from("user_duplicate_review_members").select("group_id,user_id,included").in("group_id", groupIds)
    : { data: [] };
  const userIds = [...new Set((members ?? []).map((member) => member.user_id))];
  const { data: profiles } = userIds.length
    ? await sb.from("users").select("id,full_name,phone,email,gender,created_at,updated_at,auth_user_id,identity_status,privacy_accepted_at,terms_accepted_at,age_confirmed_at,marketing_accepted").in("id", userIds)
    : { data: [] };
  const counts = new Map<string, Record<string, number>>();
  await Promise.all(userIds.flatMap((userId) => countDomains.map(async ([table, column, label]) => {
    const { count } = await sb.from(table).select("id", { head: true, count: "exact" }).eq(column, userId);
    counts.set(userId, { ...(counts.get(userId) ?? {}), [label]: count ?? 0 });
  })));
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, {
    id: profile.id,
    full_name: profile.full_name,
    phone: profile.phone,
    email: profile.email,
    gender: profile.gender,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
    auth_linked: Boolean(profile.auth_user_id),
    identity_status: profile.identity_status,
    consents: {
      privacy: Boolean(profile.privacy_accepted_at),
      terms: Boolean(profile.terms_accepted_at),
      age: Boolean(profile.age_confirmed_at),
      marketing: Boolean(profile.marketing_accepted),
    },
    reference_counts: counts.get(profile.id) ?? {},
  }]));
  return NextResponse.json({ data: (groups ?? []).map((group) => ({
    ...group,
    members: (members ?? []).filter((member) => member.group_id === group.id).map((member) => ({
      included: member.included,
      profile: profileMap.get(member.user_id),
    })),
  })) });
}

export async function POST(request: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const session = await getStaffSessionFromCookie();
  const body = await request.json().catch(() => ({}));
  const sb = supabaseAdmin();
  if (body.action === "refresh") {
    const { data, error } = await sb.rpc("refresh_user_duplicate_candidates", { p_actor_staff_id: session!.sid });
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ data });
  }
  const groupId = String(body.group_id ?? "");
  const state = String(body.state ?? "");
  if (!groupId || !["pending_review", "approved", "rejected", "conflict", "manual_only"].includes(state)) {
    return NextResponse.json({ error: "Revisione non valida" }, { status: 400 });
  }
  const canonicalId = body.canonical_user_id ? String(body.canonical_user_id) : null;
  const includedIds: string[] = Array.isArray(body.included_user_ids) ? body.included_user_ids.map(String) : [];
  const { data: memberRows } = await sb.from("user_duplicate_review_members").select("user_id").eq("group_id", groupId);
  const allowed = new Set((memberRows ?? []).map((row) => row.user_id));
  if (canonicalId && !allowed.has(canonicalId)) return NextResponse.json({ error: "Profilo canonico fuori dal gruppo" }, { status: 400 });
  if (includedIds.some((id) => !allowed.has(id))) return NextResponse.json({ error: "Membro fuori dal gruppo" }, { status: 400 });
  if (state === "approved" && (!canonicalId || !includedIds.includes(canonicalId) || includedIds.length < 2)) {
    return NextResponse.json({ error: "Seleziona canonico e almeno due profili inclusi" }, { status: 400 });
  }
  if (state === "approved") {
    const { data: activeProfiles } = await sb.from("users").select("id,auth_user_id,identity_status").in("id", includedIds);
    if ((activeProfiles ?? []).length !== includedIds.length || activeProfiles?.some((profile) => profile.identity_status !== "active")) {
      return NextResponse.json({ error: "Un profilo incluso non è più attivo" }, { status: 409 });
    }
    const linkedProfiles = (activeProfiles ?? []).filter((profile) => profile.auth_user_id);
    if (linkedProfiles.length > 1) {
      return NextResponse.json({ error: "Conflitto: più identità Auth collegate" }, { status: 409 });
    }
    if (linkedProfiles?.length === 1 && linkedProfiles[0].id !== canonicalId) {
      return NextResponse.json({ error: "Il profilo collegato ad Auth deve essere canonico" }, { status: 409 });
    }
  }
  for (const row of memberRows ?? []) {
    await sb.from("user_duplicate_review_members").update({ included: includedIds.includes(row.user_id) }).eq("group_id", groupId).eq("user_id", row.user_id);
  }
  const { error } = await sb.from("user_duplicate_review_groups").update({
    state, canonical_user_id: canonicalId, reviewed_by_staff_id: session!.sid,
    review_note: String(body.review_note ?? "").trim() || null, updated_at: new Date().toISOString(),
  }).eq("id", groupId);
  return error ? NextResponse.json({ error: error.message }, { status: 409 }) : NextResponse.json({ ok: true });
}
