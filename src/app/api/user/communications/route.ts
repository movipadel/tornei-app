import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";
import { createRuntimePerf } from "@/lib/runtimePerf";

export const runtime = "nodejs";

function normalizePhone(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

type CommunicationRow = {
  id: string;
  target: string;
  tournament_id: string | null;
  title: string;
  body: string;
  image_path: string | null;
  cta_label: string | null;
  cta_url: string | null;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

type StateRow = {
  communication_id: string;
  read_at: string | null;
  dismissed_at: string | null;
};

export async function GET() {
  const perf = createRuntimePerf("/api/user/communications");
  try {
  const uid = await getUserIdFromCookie();

  if (!uid) {
    return perf.json({ data: [] });
  }

  const sb = supabaseAdmin();

  const { data: user, error: userErr } = await perf.db(() =>
    sb.from("users").select("id,phone").eq("id", uid).single()
  );

  if (userErr) {
    return perf.json({ error: userErr.message }, { status: 500 });
  }

  const phone = normalizePhone(user?.phone);
  const targets = ["all"];

  const { data: membership } = await perf.db(() =>
    sb
      .from("loyalty_memberships")
      .select("status")
      .eq("user_id", uid)
      .maybeSingle()
  );

  if (membership?.status) {
    targets.push("moviback");

    if (membership.status === "approved") targets.push("moviback_approved");
    if (membership.status === "pending_review") targets.push("moviback_pending");
    if (membership.status === "suspended") targets.push("moviback_suspended");
  }

  let tournamentIds: string[] = [];

  if (phone.length >= 8) {
    const { data: regs, error: regsErr } = await perf.db(() =>
      sb
        .from("tournament_registrations")
        .select("tournament_id,p1_phone,p2_phone")
        .or(`p1_phone.eq.${phone},p2_phone.eq.${phone}`)
    );

    if (regsErr) {
      return perf.json({ error: regsErr.message }, { status: 500 });
    }

    tournamentIds = Array.from(
      new Set(
        (regs ?? [])
          .map((r) => String(r.tournament_id ?? ""))
          .filter(Boolean)
      )
    );
  }

  const now = new Date().toISOString();

  const { data: baseRows, error: baseErr } = await perf.db(() =>
    sb
      .from("communications")
      .select(
        "id,target,tournament_id,title,body,image_path,cta_label,cta_url,starts_at,ends_at,created_at"
      )
      .eq("is_active", true)
      .in("target", targets)
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order("created_at", { ascending: false })
  );

  if (baseErr) {
    return perf.json({ error: baseErr.message }, { status: 500 });
  }

  const { data: personalRows, error: personalErr } = await perf.db(() =>
    sb
      .from("communications")
      .select(
        "id,target,tournament_id,title,body,image_path,cta_label,cta_url,starts_at,ends_at,created_at"
      )
      .eq("is_active", true)
      .eq("target", "user")
      .eq("recipient_user_id", uid)
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order("created_at", { ascending: false })
  );

  if (personalErr) {
    return perf.json({ error: personalErr.message }, { status: 500 });
  }

  let tournamentRows: CommunicationRow[] = [];

  if (tournamentIds.length > 0) {
    const { data, error } = await perf.db(() =>
      sb
        .from("communications")
        .select(
          "id,target,tournament_id,title,body,image_path,cta_label,cta_url,starts_at,ends_at,created_at"
        )
        .eq("is_active", true)
        .eq("target", "tournament")
        .in("tournament_id", tournamentIds)
        .lte("starts_at", now)
        .or(`ends_at.is.null,ends_at.gte.${now}`)
        .order("created_at", { ascending: false })
    );

    if (error) {
      return perf.json({ error: error.message }, { status: 500 });
    }

    tournamentRows = (data ?? []) as CommunicationRow[];
  }

  const merged = [
    ...((baseRows ?? []) as CommunicationRow[]),
    ...((personalRows ?? []) as CommunicationRow[]),
    ...tournamentRows,
  ];

  if (merged.length === 0) {
    return perf.json({ data: [] });
  }

  const communicationIds = merged.map((row) => row.id);

  const { data: states, error: statesErr } = await perf.db(() =>
    sb
      .from("communication_user_states")
      .select("communication_id,read_at,dismissed_at")
      .eq("user_id", uid)
      .in("communication_id", communicationIds)
  );

  if (statesErr) {
    return perf.json({ error: statesErr.message }, { status: 500 });
  }

  const stateByCommunicationId = new Map<string, StateRow>();

  for (const state of (states ?? []) as StateRow[]) {
    stateByCommunicationId.set(state.communication_id, state);
  }

  const out = merged
    .map((row) => {
      const state = stateByCommunicationId.get(row.id);

      return {
        ...row,
        read_at: state?.read_at ?? null,
        dismissed_at: state?.dismissed_at ?? null,
      };
    })
    .filter((row) => !row.dismissed_at)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  return perf.json({ data: out });
  } finally {
    perf.finish();
  }
}
