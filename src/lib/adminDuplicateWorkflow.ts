import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

type RawPreview = {
  conflicts?: string[];
  blockers?: string[];
  warnings?: string[];
  fingerprint?: string;
  pair_counts?: Record<string, number>;
  moviback?: { applicable?: boolean; safe?: boolean; blockers?: string[]; expected_balance?: number };
};

type GroupRow = {
  id: string;
  signal_type: string;
  signal_value: string | null;
  state: string;
  is_stale: boolean;
  warning_flags: string[];
  recommended_user_id: string | null;
  recommendation_reasons: string[];
};

type UserRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  gender: string;
  created_at: string;
  updated_at: string;
  auth_user_id: string | null;
  identity_status: string;
  merged_into_user_id: string | null;
};

const fields = ["full_name", "phone", "email", "gender"] as const;

const humanBlocker: Record<string, string> = {
  source_has_auth_identity: "Un profilo da unire possiede già un accesso Auth. Scegli quel profilo come principale.",
  multiple_auth_identities: "Sono presenti più identità di accesso. Serve una verifica prima di continuare.",
  dual_loyalty_membership: "Sono presenti più tessere MoviBack e la riconciliazione non è sicura.",
  membership_cardinality_unsupported: "La situazione MoviBack richiede una verifica manuale.",
  membership_not_approved: "Una tessera MoviBack non è nello stato corretto per l’unione.",
  tax_code_mismatch: "Le tessere MoviBack hanno dati fiscali incompatibili.",
  membership_type_mismatch: "Le tessere MoviBack appartengono a tipologie incompatibili.",
  ledger_redemption_mismatch: "Il saldo MoviBack non può essere riconciliato automaticamente.",
  same_tournament: "I profili risultano iscritti allo stesso torneo.",
  same_tournament_run: "I profili compaiono nello stesso evento torneo.",
  same_league_roster: "I profili compaiono nella stessa squadra Monday League.",
  distinct_active_league_roles: "I profili hanno ruoli Monday League attivi incompatibili.",
  idempotency_key_divergence: "Sono presenti operazioni business incompatibili.",
  existing_alias_relationship: "Il gruppo è cambiato mentre era in revisione. Riaprilo dalla coda aggiornata.",
  inactive_or_merged_profile: "Il gruppo è cambiato mentre era in revisione. Riaprilo dalla coda aggiornata.",
  candidate_group_stale: "Il gruppo è cambiato mentre era in revisione. È stata richiesta una nuova verifica.",
  stale_preview: "Un altro amministratore ha modificato il gruppo. Riapri il riepilogo aggiornato.",
};

function unique<T>(values: T[]) { return [...new Set(values)]; }

async function groupMembers(groupId: string) {
  const sb = supabaseAdmin();
  const { data: members, error } = await sb.from("user_duplicate_review_members")
    .select("user_id,included").eq("group_id", groupId);
  if (error) throw error;
  const ids = (members ?? []).map((member) => member.user_id);
  if (!ids.length) return [] as UserRow[];
  const users = await sb.from("users")
    .select("id,full_name,phone,email,gender,created_at,updated_at,auth_user_id,identity_status,merged_into_user_id")
    .in("id", ids);
  if (users.error) throw users.error;
  return (users.data ?? []) as UserRow[];
}

async function loadGroup(groupId: string) {
  const { data, error } = await supabaseAdmin().from("user_duplicate_review_groups")
    .select("id,signal_type,signal_value,state,is_stale,warning_flags,recommended_user_id,recommendation_reasons")
    .eq("id", groupId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Gruppo non trovato");
  return data as GroupRow;
}

async function activeIdsFor(groupId: string) {
  const members = await groupMembers(groupId);
  const candidates = unique(members.map((user) => user.identity_status === "active" ? user.id : user.merged_into_user_id).filter(Boolean) as string[]);
  if (!candidates.length) return [];
  const { data, error } = await supabaseAdmin().from("users").select("id,identity_status").in("id", candidates);
  if (error) throw error;
  return (data ?? []).filter((user) => user.identity_status === "active").map((user) => user.id).sort();
}

async function recoverCurrentGroup(group: GroupRow, actorId: string, desiredKeepId: string) {
  let activeIds = await activeIdsFor(group.id);
  const keepId = activeIds.includes(desiredKeepId) ? desiredKeepId : activeIds[0] ?? desiredKeepId;
  if (!group.is_stale || activeIds.length < 2) return { group, activeIds, keepId };

  const scan = await supabaseAdmin().rpc("run_user_duplicate_scan", { p_actor_staff_id: actorId });
  if (scan.error) throw scan.error;
  const candidates = await supabaseAdmin().from("user_duplicate_review_groups")
    .select("id,signal_type,signal_value,state,is_stale,warning_flags,recommended_user_id,recommendation_reasons")
    .eq("signal_type", group.signal_type).eq("signal_value", group.signal_value).order("updated_at", { ascending: false }).limit(10);
  if (candidates.error) throw candidates.error;
  for (const candidate of candidates.data ?? []) {
    const ids = await activeIdsFor(candidate.id);
    if (!candidate.is_stale && ids.includes(keepId) && ids.some((id) => id !== keepId)) {
      return { group: candidate as GroupRow, activeIds: ids, keepId };
    }
  }
  activeIds = await activeIdsFor(group.id);
  return { group, activeIds, keepId };
}

async function profiles(ids: string[]) {
  if (!ids.length) return [] as UserRow[];
  const { data, error } = await supabaseAdmin().from("users")
    .select("id,full_name,phone,email,gender,created_at,updated_at,auth_user_id,identity_status,merged_into_user_id")
    .in("id", ids);
  if (error) throw error;
  return (data ?? []) as UserRow[];
}

function fieldPlan(users: UserRow[], keep: UserRow, choices: Record<string, string> = {}) {
  const winners: Record<string, string> = {};
  const ambiguities: Array<{ field: string; question: string; options: Array<{ user_id: string; value: string }> }> = [];
  for (const field of fields) {
    const selected = choices[field];
    const selectedUser = users.find((user) => user.id === selected);
    winners[field] = selectedUser?.id ?? keep.id;
    const keepValue = String(keep[field] ?? "").trim();
    const options = unique(users.map((user) => String(user[field] ?? "").trim()).filter(Boolean));
    if (!keepValue && options.length > 1 && !selectedUser) {
      ambiguities.push({
        field,
        question: field === "phone" ? "Quale numero è corretto?" : field === "email" ? "Quale email è corretta?" : `Quale ${field === "full_name" ? "nome" : "genere"} è corretto?`,
        options: users.filter((user) => String(user[field] ?? "").trim()).map((user) => ({ user_id: user.id, value: String(user[field]) })),
      });
    }
  }
  return { winners, ambiguities };
}

async function buildPreview(groupId: string, keepId: string, actorId: string, choices: Record<string, string> = {}) {
  const original = await loadGroup(groupId);
  const current = await recoverCurrentGroup(original, actorId, keepId);
  const users = await profiles(current.activeIds);
  const keep = users.find((user) => user.id === current.keepId);
  if (!keep || users.length < 2) {
    return { state: "resolved", group_id: current.group.id, requested_group_id: groupId, keep_user_id: keep?.id ?? current.keepId, profile_count: users.length };
  }
  const sources = users.filter((user) => user.id !== keep.id).sort((a, b) => a.id.localeCompare(b.id));
  const plan = fieldPlan(users, keep, choices);
  const technicalPairs: Array<{ source_user_id: string; blockers: string[]; preview: RawPreview }> = [];
  const rawBlockers: string[] = [];
  if (current.group.is_stale) rawBlockers.push("candidate_group_stale");
  for (const source of sources) {
    const base = await supabaseAdmin().rpc("preview_user_merge", { p_source_user_id: source.id, p_canonical_user_id: keep.id });
    if (base.error) throw base.error;
    const pair = (base.data ?? {}) as RawPreview;
    const movi = await supabaseAdmin().rpc("preview_dual_moviback_reconciliation", { p_source_user_id: source.id, p_canonical_user_id: keep.id });
    if (movi.error) throw movi.error;
    const moviback = (movi.data ?? {}) as RawPreview["moviback"];
    rawBlockers.push(...(pair.conflicts ?? []).filter((code) => code !== "dual_loyalty_membership" || !moviback?.safe));
    if (moviback?.applicable && !moviback.safe) rawBlockers.push(...(moviback.blockers ?? ["dual_loyalty_membership"]));
    technicalPairs.push({ source_user_id: source.id, blockers: pair.conflicts ?? [], preview: { ...pair, moviback } });
  }

  // Detect cross-source collisions that become relevant only after an earlier source
  // has already moved into the selected profile.
  for (let left = 0; left < users.length; left++) for (let right = left + 1; right < users.length; right++) {
    const pair = await supabaseAdmin().rpc("preview_user_merge", { p_source_user_id: users[left].id, p_canonical_user_id: users[right].id });
    if (pair.error) throw pair.error;
    const conflicts = ((pair.data ?? {}) as RawPreview).conflicts ?? [];
    rawBlockers.push(...conflicts.filter((code) => ["multiple_auth_identities", "same_tournament", "same_tournament_run", "same_league_roster", "idempotency_key_divergence"].includes(code)));
  }
  const authLinked = users.filter((user) => user.auth_user_id);
  if (authLinked.length > 1) rawBlockers.push("multiple_auth_identities");
  if (authLinked.length === 1 && authLinked[0].id !== keep.id) rawBlockers.push("source_has_auth_identity");
  const leagueRoles = await supabaseAdmin().from("league_team_players").select("user_id,team_id")
    .in("user_id", current.activeIds).eq("is_active", true);
  if (leagueRoles.error) throw leagueRoles.error;
  if (unique((leagueRoles.data ?? []).map((role) => role.team_id)).length > 1) rawBlockers.push("distinct_active_league_roles");

  const memberships = await supabaseAdmin().from("loyalty_memberships").select("user_id,id").in("user_id", current.activeIds);
  if (memberships.error) throw memberships.error;
  const membershipOwners = unique((memberships.data ?? []).map((membership) => membership.user_id));
  for (let left = 0; left < membershipOwners.length; left++) for (let right = left + 1; right < membershipOwners.length; right++) {
    const movi = await supabaseAdmin().rpc("preview_dual_moviback_reconciliation", {
      p_source_user_id: membershipOwners[left], p_canonical_user_id: membershipOwners[right],
    });
    if (movi.error) throw movi.error;
    const value = (movi.data ?? {}) as { safe?: boolean; blockers?: string[] };
    if (!value.safe) rawBlockers.push(...(value.blockers ?? ["dual_loyalty_membership"]));
  }

  const counts = await supabaseAdmin().rpc("duplicate_user_reference_counts", { p_user_ids: current.activeIds });
  if (counts.error) throw counts.error;
  const totals: Record<string, number> = {};
  for (const row of counts.data ?? []) for (const [key, value] of Object.entries(row.reference_counts as Record<string, number>)) totals[key] = (totals[key] ?? 0) + Number(value ?? 0);
  const transactions = memberships.data?.length
    ? await supabaseAdmin().from("loyalty_transactions").select("membership_id,points_delta").in("membership_id", memberships.data.map((membership) => membership.id))
    : { data: [], error: null };
  if (transactions.error) throw transactions.error;
  totals.moviback_points = (transactions.data ?? []).reduce((sum, transaction) => sum + Number(transaction.points_delta), 0);

  const codes = unique(rawBlockers);
  return {
    state: codes.length || plan.ambiguities.length ? "attention" : "ready",
    group_id: current.group.id,
    requested_group_id: groupId,
    recovered_group: current.group.id !== groupId,
    profile_count: users.length,
    keep_user_id: keep.id,
    keep_profile: { id: keep.id, full_name: keep.full_name, phone: keep.phone, email: keep.email, gender: keep.gender },
    source_user_ids: sources.map((source) => source.id),
    final_fields: Object.fromEntries(fields.map((field) => [field, users.find((user) => user.id === plan.winners[field])?.[field] ?? keep[field]])),
    field_choices: plan.ambiguities,
    totals,
    blockers: codes.map((code) => ({ code, message: humanBlocker[code] ?? "Questa situazione richiede una verifica manuale." })),
    new_access_pending: original.warning_flags.includes("activation_review_required") || current.group.warning_flags.includes("activation_review_required"),
    recommendation: { user_id: current.group.recommended_user_id, reasons: current.group.recommendation_reasons },
    technical: { group_state: current.group.state, group_stale: current.group.is_stale, field_winners: plan.winners, pairs: technicalPairs },
  };
}

export async function previewDuplicateGroup(groupId: string, keepId: string, actorId: string, choices: Record<string, string> = {}) {
  return buildPreview(groupId, keepId, actorId, choices);
}

export async function resolveDuplicateGroup(groupId: string, keepId: string, actorId: string, choices: Record<string, string> = {}) {
  let preview = await buildPreview(groupId, keepId, actorId, choices);
  if (preview.state === "resolved") return { ...preview, state: "completed", idempotent: true, completed: [] };
  if (preview.state !== "ready") return preview;
  const completed: Array<{ source_user_id: string; operation_id: string; verification: unknown }> = [];
  let currentGroupId = preview.group_id;
  let winners = (preview.technical as { field_winners: Record<string, string> }).field_winners;

  for (const sourceId of preview.source_user_ids as string[]) {
    const activeIds = await activeIdsFor(currentGroupId);
    if (!activeIds.includes(sourceId)) continue;
    if (!activeIds.includes(preview.keep_user_id)) {
      return { state: "attention", completed, blockers: [{ code: "stale_preview", message: humanBlocker.stale_preview }] };
    }
    const decision = await supabaseAdmin().rpc("save_user_duplicate_review_decision", {
      p_group_id: currentGroupId, p_state: "approved", p_canonical_user_id: preview.keep_user_id,
      p_source_user_id: sourceId, p_included_user_ids: activeIds, p_field_winners: winners,
      p_note: "Unione gruppo duplicati confermata dall’amministratore", p_actor_staff_id: actorId,
    });
    if (decision.error) return { state: "attention", completed, blockers: [{ code: "stale_preview", message: humanBlocker.stale_preview }] };
    const fresh = await supabaseAdmin().rpc("preview_reviewed_user_merge", {
      p_group_id: currentGroupId, p_source_user_id: sourceId, p_canonical_user_id: preview.keep_user_id,
    });
    if (fresh.error) return { state: "attention", completed, blockers: [{ code: "stale_preview", message: humanBlocker.stale_preview }] };
    const pair = fresh.data as RawPreview;
    if ((pair.blockers ?? []).length) return {
      state: "attention", completed,
      blockers: unique(pair.blockers ?? []).map((code) => ({ code, message: humanBlocker[code] ?? "Questa situazione richiede una verifica manuale." })),
    };
    const created = await supabaseAdmin().rpc("create_reviewed_user_merge_operation", {
      p_group_id: currentGroupId, p_source_user_id: sourceId, p_actor_staff_id: actorId,
      p_reason: "Unione gruppo duplicati confermata dall’amministratore",
    });
    if (created.error) return { state: "attention", completed, blockers: [{ code: "stale_preview", message: humanBlocker.stale_preview }] };
    const operation = created.data as { operation_id: string; preview: { fingerprint: string } };
    const executed = await supabaseAdmin().rpc("execute_reviewed_user_merge", {
      p_operation_id: operation.operation_id, p_expected_fingerprint: operation.preview.fingerprint, p_actor_staff_id: actorId,
    });
    const result = executed.data as { state?: string; verification?: unknown } | null;
    if (executed.error || result?.state !== "completed") return {
      state: "attention", completed,
      blockers: [{ code: "stale_preview", message: humanBlocker.stale_preview }],
      technical: { operation_id: operation.operation_id, rpc_result: result, error: executed.error?.message },
    };
    completed.push({ source_user_id: sourceId, operation_id: operation.operation_id, verification: result.verification });
    preview = await buildPreview(currentGroupId, preview.keep_user_id, actorId, choices);
    currentGroupId = preview.group_id;
    if (preview.state === "resolved") break;
    if (preview.state !== "ready") return { ...preview, completed };
    winners = (preview.technical as { field_winners: Record<string, string> }).field_winners;
  }

  const canonical = (await profiles([preview.keep_user_id]))[0];
  let auth_continuation: { state: string } | null = null;
  if (canonical) {
    const onboarding = await supabaseAdmin().from("user_auth_onboarding").select("auth_user_id")
      .eq("state", "review_required").eq("normalized_email", canonical.email.trim().toLowerCase()).limit(2);
    if (!onboarding.error && onboarding.data?.length === 1) {
      const resumed = await supabaseAdmin().rpc("resolve_and_link_verified_auth_user", { p_auth_user_id: onboarding.data[0].auth_user_id });
      if (!resumed.error) auth_continuation = { state: String((resumed.data as { state?: string } | null)?.state ?? "pending") };
    }
  }
  return { state: "completed", group_id: currentGroupId, keep_user_id: preview.keep_user_id, completed, auth_continuation };
}
