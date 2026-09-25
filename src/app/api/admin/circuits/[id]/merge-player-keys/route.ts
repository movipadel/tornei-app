import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStaffSessionFromCookie } from "@/lib/staffSession";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type Body = {
  ranking_group_id: string;
  correct_player_key: string;
  wrong_player_keys: string[];
  player_name?: string;
  player_phone?: string | null;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id: circuitId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Body | null;

  if (!body) {
    return NextResponse.json({ error: "Body mancante" }, { status: 400 });
  }

  const rankingGroupId = String(body.ranking_group_id ?? "").trim();
  const correctKey = String(body.correct_player_key ?? "").trim();
  const wrongKeys = Array.from(
    new Set((body.wrong_player_keys ?? []).map((x) => String(x).trim()).filter(Boolean))
  ).filter((x) => x !== correctKey);

  const playerName = String(body.player_name ?? "").trim() || null;
  const playerPhone = body.player_phone ? String(body.player_phone).trim() : null;

  if (!circuitId) {
    return NextResponse.json({ error: "Circuito mancante" }, { status: 400 });
  }

  if (!rankingGroupId) {
    return NextResponse.json({ error: "Ranking group mancante" }, { status: 400 });
  }

  if (!correctKey) {
    return NextResponse.json({ error: "Key corretta mancante" }, { status: 400 });
  }

  if (wrongKeys.length === 0) {
    return NextResponse.json({ error: "Nessuna key da unire" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: group, error: groupErr } = await sb
    .from("circuit_ranking_groups")
    .select("id,circuit_id")
    .eq("id", rankingGroupId)
    .eq("circuit_id", circuitId)
    .maybeSingle();

  if (groupErr) {
    return NextResponse.json({ error: groupErr.message }, { status: 500 });
  }

  if (!group) {
    return NextResponse.json(
      { error: "Ranking group non appartenente al circuito" },
      { status: 400 }
    );
  }

  const actor = await getStaffSessionFromCookie();
  const { data, error } = await sb.rpc('player_identity_merge_legacy_keys', {
    p_circuit: circuitId, p_group: rankingGroupId, p_correct: correctKey,
    p_wrong: wrongKeys, p_name: playerName, p_phone: playerPhone, p_actor: actor!.sid,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json(data, { status: data?.state === 'review' ? 409 : 200 });
}
