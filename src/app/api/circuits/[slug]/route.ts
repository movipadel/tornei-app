import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type PublicRankingRow = {
  position: number;
  player_name: string;
  total_points: number;
  events_played: number;
};

type PublicStageResult = {
  player_name: string;
  points: number;
  placement: number | null;
};

type PublicStage = {
  tournament_name: string;
  tournament_type: string;
  tournament_date: string | null;
  results: PublicStageResult[];
};

type UpcomingStage = {
  id: string;
  name: string;
  date: string | null;
  time: string | null;
  location: string | null;
  registrations_open: boolean;
};

type PublicRankingGroup = {
  id: string;
  category: string | null;
  level: string | null;
  ranking: PublicRankingRow[];
  played_stages: PublicStage[];
  upcoming_stages: UpcomingStage[];
};

function todayRomeISODate() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

function normalizeValue(v?: string | null) {
  return String(v ?? "").trim().toLowerCase();
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await ctx.params;

    if (!slug) {
      return NextResponse.json({ error: "Slug mancante" }, { status: 400 });
    }

    const sb = supabaseAdmin();

    const { data: circuit, error: circuitErr } = await sb
  .from("circuits")
  .select(
    "id,name,slug,tournament_type,status,hero_logo_url,hero_logo_2_url,hero_logo_3_url,hero_subtitle,theme_key,created_at,updated_at"
  )
  .eq("slug", slug)
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
      .eq("circuit_id", circuit.id)
      .order("category", { ascending: true })
      .order("level", { ascending: true });

    if (groupsErr) {
      return NextResponse.json({ error: groupsErr.message }, { status: 500 });
    }

    const todayRome = todayRomeISODate();

    const { data: futureTournaments, error: futureErr } = await sb
      .from("tournaments")
      .select("id,name,type,category,level,date,time,location,registrations_open,circuit_id")
      .eq("circuit_id", circuit.id)
      .gte("date", todayRome)
      .order("date", { ascending: true })
      .order("time", { ascending: true });

    if (futureErr) {
      return NextResponse.json({ error: futureErr.message }, { status: 500 });
    }

    const rankingGroups: PublicRankingGroup[] = [];

    for (const group of groups ?? []) {
      const { data: results, error: resultsErr } = await sb
        .from("circuit_results")
        .select(
          "source_tournament_id,tournament_name,tournament_type,tournament_date,player_name,points,placement,created_at"
        )
        .eq("ranking_group_id", group.id)
        .order("tournament_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: true });

      if (resultsErr) {
        return NextResponse.json({ error: resultsErr.message }, { status: 500 });
      }

      const byPlayer = new Map<
        string,
        {
          player_name: string;
          total_points: number;
          events_played: number;
        }
      >();

      for (const row of results ?? []) {
        const playerName = String(row.player_name ?? "").trim();
        if (!playerName) continue;

        const current = byPlayer.get(playerName) ?? {
          player_name: playerName,
          total_points: 0,
          events_played: 0,
        };

        current.total_points += Number(row.points ?? 0);
        current.events_played += 1;

        byPlayer.set(playerName, current);
      }

      const ranking: PublicRankingRow[] = Array.from(byPlayer.values())
        .sort((a, b) => {
          if (b.total_points !== a.total_points) return b.total_points - a.total_points;
          return a.player_name.localeCompare(b.player_name, "it");
        })
        .map((row, index) => ({
          position: index + 1,
          player_name: row.player_name,
          total_points: row.total_points,
          events_played: row.events_played,
        }));

      const stageMap = new Map<string, PublicStage>();

      for (const row of results ?? []) {
        const stageKey = [
          row.source_tournament_id ?? "no-source",
          row.tournament_name ?? "",
          row.tournament_type ?? "",
          row.tournament_date ?? "",
        ].join("__");

        if (!stageMap.has(stageKey)) {
          stageMap.set(stageKey, {
            tournament_name: String(row.tournament_name ?? "Tappa"),
            tournament_type: String(row.tournament_type ?? ""),
            tournament_date: row.tournament_date ?? null,
            results: [],
          });
        }

        stageMap.get(stageKey)!.results.push({
          player_name: String(row.player_name ?? "-"),
          points: Number(row.points ?? 0),
          placement: row.placement ?? null,
        });
      }

      const played_stages: PublicStage[] = Array.from(stageMap.values()).map((stage) => ({
        ...stage,
        results: [...stage.results].sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (a.placement == null && b.placement == null) {
            return a.player_name.localeCompare(b.player_name, "it");
          }
          if (a.placement == null) return 1;
          if (b.placement == null) return -1;
          if (a.placement !== b.placement) return a.placement - b.placement;
          return a.player_name.localeCompare(b.player_name, "it");
        }),
      }));

      const groupCategory = normalizeValue(group.category);
      const groupLevel = normalizeValue(group.level);

      const upcoming_stages: UpcomingStage[] = (futureTournaments ?? [])
        .filter((t) => {
          const tournamentCategory = normalizeValue((t as any).category);
          const tournamentLevel = normalizeValue((t as any).level);

          return tournamentCategory === groupCategory && tournamentLevel === groupLevel;
        })
        .map((t: any) => ({
          id: String(t.id),
          name: String(t.name ?? "Tappa"),
          date: t.date ?? null,
          time: t.time ?? null,
          location: t.location ?? null,
          registrations_open: Boolean(t.registrations_open),
        }));

      rankingGroups.push({
        id: group.id,
        category: group.category,
        level: group.level,
        ranking,
        played_stages,
        upcoming_stages,
      });
    }

    return NextResponse.json({
  circuit: {
    id: circuit.id,
    name: circuit.name,
    slug: circuit.slug,
    tournament_type: circuit.tournament_type,
    status: circuit.status,
    hero_logo_url: circuit.hero_logo_url ?? null,
    hero_logo_2_url: circuit.hero_logo_2_url ?? null,
    hero_logo_3_url: circuit.hero_logo_3_url ?? null,
    hero_subtitle: circuit.hero_subtitle ?? null,
    theme_key: circuit.theme_key ?? null,
  },
  ranking_groups: rankingGroups,
});
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Errore interno" },
      { status: 500 }
    );
  }
}