import { sortPublicCircuitStageResults } from "@/lib/circuitStageResults";
import { editorialJson } from "@/lib/padelleriaServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const normalized = (value: string | null) => String(value ?? "").trim().toLowerCase();

export async function GET(req: Request, ctx: { params: Promise<{ slug: string; tournamentId: string }> }) {
  const { slug, tournamentId } = await ctx.params;
  const search = new URL(req.url).searchParams;
  const requestedGroup = search.get("group");
  if (!slug || !tournamentId || [...search.keys()].some((key) => key !== "group")) {
    return editorialJson({ error: "Parametri non validi" }, 400);
  }

  try {
    const sb = supabaseAdmin();
    const circuitResult = await sb.from("circuits")
      .select("id,name,slug,status,hero_logo_url,hero_logo_2_url,hero_logo_3_url")
      .eq("slug", slug)
      .maybeSingle();
    if (circuitResult.error) throw new Error("Circuito non disponibile");
    if (!circuitResult.data) return editorialJson({ error: "Circuito non trovato" }, 404);

    const tournamentResult = await sb.from("tournaments")
      .select("id,circuit_id,name,type,category,level,date,time,location")
      .eq("id", tournamentId)
      .eq("circuit_id", circuitResult.data.id)
      .maybeSingle();
    if (tournamentResult.error) throw new Error("Tappa non disponibile");
    if (!tournamentResult.data) return editorialJson({ error: "Tappa non trovata" }, 404);
    const tournament = tournamentResult.data;

    let groupsQuery = sb.from("circuit_ranking_groups")
      .select("id,circuit_id,category,level")
      .eq("circuit_id", circuitResult.data.id);
    if (requestedGroup) groupsQuery = groupsQuery.eq("id", requestedGroup);
    const groupsResult = await groupsQuery;
    if (groupsResult.error) throw new Error("Classifica non disponibile");
    const group = groupsResult.data?.find((candidate) =>
      normalized(candidate.category) === normalized(tournament.category) &&
      normalized(candidate.level) === normalized(tournament.level)
    );
    if (!group) return editorialJson({ error: "Tappa non trovata" }, 404);

    const resultsQuery = await sb.from("circuit_results")
      .select("player_name,points,placement")
      .eq("circuit_id", circuitResult.data.id)
      .eq("ranking_group_id", group.id)
      .eq("source_tournament_id", tournamentId);
    if (resultsQuery.error) throw new Error("Risultati non disponibili");

    return editorialJson({
      circuit: circuitResult.data,
      group: { id: group.id, category: group.category, level: group.level },
      stage: {
        id: tournament.id,
        name: tournament.name,
        type: tournament.type,
        category: tournament.category,
        level: tournament.level,
        date: tournament.date,
        time: tournament.time,
        location: tournament.location,
      },
      results: sortPublicCircuitStageResults((resultsQuery.data ?? []).map((row) => ({
        player_name: String(row.player_name ?? "-"),
        points: Number(row.points ?? 0),
        placement: row.placement ?? null,
      }))),
    });
  } catch {
    return editorialJson({ error: "Tappa temporaneamente non disponibile" }, 503);
  }
}
