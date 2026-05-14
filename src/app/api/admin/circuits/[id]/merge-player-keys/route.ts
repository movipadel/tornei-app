import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
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

  try {
    let deletedDuplicates = 0;
    let updatedRows = 0;

    for (const wrongKey of wrongKeys) {
      const { data: wrongRows, error: wrongErr } = await sb
        .from("circuit_results")
        .select("id,ranking_group_id,source_tournament_id,player_key")
        .eq("ranking_group_id", rankingGroupId)
        .eq("player_key", wrongKey);

      if (wrongErr) {
        return NextResponse.json({ error: wrongErr.message }, { status: 500 });
      }

      for (const wrongRow of wrongRows ?? []) {
        const sourceTournamentId = (wrongRow as any).source_tournament_id;

        const { data: existingCorrect, error: existingErr } = await sb
          .from("circuit_results")
          .select("id")
          .eq("ranking_group_id", rankingGroupId)
          .eq("source_tournament_id", sourceTournamentId)
          .eq("player_key", correctKey)
          .maybeSingle();

        if (existingErr) {
          return NextResponse.json({ error: existingErr.message }, { status: 500 });
        }

        if (existingCorrect?.id) {
          const { error: delErr } = await sb
            .from("circuit_results")
            .delete()
            .eq("id", (wrongRow as any).id);

          if (delErr) {
            return NextResponse.json({ error: delErr.message }, { status: 500 });
          }

          deletedDuplicates += 1;
        } else {
          const updatePayload: Record<string, any> = {
            player_key: correctKey,
          };

          if (playerName) updatePayload.player_name = playerName;
          if (playerPhone) updatePayload.player_phone = playerPhone;

          const { error: updErr } = await sb
            .from("circuit_results")
            .update(updatePayload)
            .eq("id", (wrongRow as any).id);

          if (updErr) {
            return NextResponse.json({ error: updErr.message }, { status: 500 });
          }

          updatedRows += 1;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      updatedRows,
      deletedDuplicates,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Errore merge giocatore" },
      { status: 500 }
    );
  }
}