import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type RankingRow = {
  player_key: string;
  player_name: string;
  total_points: number;
  events_played: number;
};

type CircuitResultRow = {
  player_key: string | null;
  player_name: string | null;
  player_phone: string | null;
  points: number | null;
  placement: number | null;
  source_tournament_id: string | null;
  tournament_name: string | null;
  tournament_type: string | null;
  tournament_date: string | null;
};

type PlayedStageResult = {
  player_key: string;
  player_name: string;
  player_phone: string | null;
  points: number;
  placement: number | null;
};

type PlayedStage = {
  source_tournament_id: string | null;
  tournament_name: string;
  tournament_type: string;
  tournament_date: string | null;
  results: PlayedStageResult[];
};

function normalizePlayerName(value?: string | null) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin(req);
  if (denied) return denied;

  const { id: circuitId } = await ctx.params;
  const sb = supabaseAdmin();

  const { data: circuit, error: circuitErr } = await sb
    .from("circuits")
    .select("id,name,slug,tournament_type,status,created_at,updated_at")
    .eq("id", circuitId)
    .single();

  if (circuitErr) {
    return NextResponse.json({ error: circuitErr.message }, { status: 500 });
  }

  if (!circuit) {
    return NextResponse.json({ error: "Circuito non trovato" }, { status: 404 });
  }

  const { data: groups, error: groupsErr } = await sb
    .from("circuit_ranking_groups")
    .select("id,category,level")
    .eq("circuit_id", circuitId)
    .order("category", { ascending: true })
    .order("level", { ascending: true });

  if (groupsErr) {
    return NextResponse.json({ error: groupsErr.message }, { status: 500 });
  }

  const rankingGroups = [];

  for (const group of groups ?? []) {
    const { data: results, error: resultsErr } = await sb
      .from("circuit_results")
      .select(
        `
        player_key,
        player_name,
        player_phone,
        points,
        placement,
        source_tournament_id,
        tournament_name,
        tournament_type,
        tournament_date
      `
      )
      .eq("ranking_group_id", group.id);

    if (resultsErr) {
      return NextResponse.json({ error: resultsErr.message }, { status: 500 });
    }

    const typedResults = (results ?? []) as CircuitResultRow[];

    const byPlayer = new Map<string, RankingRow>();
    const playedStagesMap = new Map<string, PlayedStage>();

    for (const row of typedResults) {
      const playerKey = String(row.player_key ?? "");
      if (!playerKey) continue;

      const current = byPlayer.get(playerKey) ?? {
        player_key: playerKey,
        player_name: String(row.player_name ?? "-"),
        total_points: 0,
        events_played: 0,
      };

      current.total_points += Number(row.points ?? 0);

      // Conta una tappa per riga risultato.
      // Con la unique constraint (ranking_group_id, source_tournament_id, player_key) va bene.
      current.events_played += 1;

      // Tiene il nome più recente/non vuoto
      if (row.player_name) {
        current.player_name = String(row.player_name);
      }

      byPlayer.set(playerKey, current);

      const stageKey = [
        String(row.source_tournament_id ?? ""),
        String(row.tournament_name ?? ""),
        String(row.tournament_type ?? ""),
        String(row.tournament_date ?? ""),
      ].join("__");

      const stage = playedStagesMap.get(stageKey) ?? {
        source_tournament_id: row.source_tournament_id ?? null,
        tournament_name: String(row.tournament_name ?? "-"),
        tournament_type: String(row.tournament_type ?? "-"),
        tournament_date: row.tournament_date ?? null,
        results: [],
      };

      stage.results.push({
        player_key: playerKey,
        player_name: String(row.player_name ?? "-"),
        player_phone: row.player_phone ?? null,
        points: Number(row.points ?? 0),
        placement: row.placement ?? null,
      });

      playedStagesMap.set(stageKey, stage);
    }

    const ranking = Array.from(byPlayer.values())
      .sort((a, b) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points;
        return a.player_name.localeCompare(b.player_name, "it");
      })
      .map((row, index) => ({
        position: index + 1,
        ...row,
      }));

    const played_stages = Array.from(playedStagesMap.values())
      .map((stage) => ({
        ...stage,
        results: [...stage.results].sort((a, b) => {
          const aPlacement = a.placement ?? Number.MAX_SAFE_INTEGER;
          const bPlacement = b.placement ?? Number.MAX_SAFE_INTEGER;

          if (aPlacement !== bPlacement) return aPlacement - bPlacement;
          if (b.points !== a.points) return b.points - a.points;
          return a.player_name.localeCompare(b.player_name, "it");
        }),
      }))
      .sort((a, b) => {
        const aDate = a.tournament_date ?? "";
        const bDate = b.tournament_date ?? "";

        if (aDate !== bDate) return bDate.localeCompare(aDate, "it");
        return a.tournament_name.localeCompare(b.tournament_name, "it");
      });

          const duplicatesByName = new Map<
      string,
      {
        normalized_name: string;
        names: Set<string>;
        keys: Set<string>;
        phones: Set<string>;
      }
    >();

    for (const row of typedResults) {
      const normalizedName = normalizePlayerName(row.player_name);
      const playerKey = String(row.player_key ?? "").trim();

      if (!normalizedName || !playerKey) continue;

      const current =
        duplicatesByName.get(normalizedName) ?? {
          normalized_name: normalizedName,
          names: new Set<string>(),
          keys: new Set<string>(),
          phones: new Set<string>(),
        };

      if (row.player_name) current.names.add(String(row.player_name));
      current.keys.add(playerKey);
      if (row.player_phone) current.phones.add(String(row.player_phone));

      duplicatesByName.set(normalizedName, current);
    }

    const possible_duplicates = Array.from(duplicatesByName.values())
      .filter((x) => x.keys.size > 1)
      .map((x) => ({
        normalized_name: x.normalized_name,
        names: Array.from(x.names),
        player_keys: Array.from(x.keys),
        player_phones: Array.from(x.phones),
      }));

        rankingGroups.push({
      id: group.id,
      category: group.category,
      level: group.level,
      ranking,
      played_stages,
      possible_duplicates,
    });
  }

  return NextResponse.json({
    data: {
      circuit,
      ranking_groups: rankingGroups,
    },
  });
}