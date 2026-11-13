import { buildCircuitStageDetail, type CircuitStageResultRow } from "@/lib/circuitStageResults";
import { editorialJson } from "@/lib/padelleriaServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, ctx: { params: Promise<{ slug: string; tournamentId: string }> }) {
  const { slug, tournamentId } = await ctx.params;
  const search = new URL(req.url).searchParams;
  const requestedGroup = search.get("group");
  if (!slug || !tournamentId || [...search.keys()].some((key) => key !== "group")) {
    return editorialJson({ error: "Parametri non validi" }, 400);
  }
  if (!UUID.test(tournamentId) || (requestedGroup && !UUID.test(requestedGroup))) {
    return editorialJson({ error: "Tappa non trovata" }, 404);
  }

  try {
    const sb = supabaseAdmin();
    const circuitResult = await sb.from("circuits")
      .select("id,name,slug,status,hero_logo_url,hero_logo_2_url,hero_logo_3_url")
      .eq("slug", slug)
      .maybeSingle();
    if (circuitResult.error) throw new Error("Circuito non disponibile");
    if (!circuitResult.data) return editorialJson({ error: "Circuito non trovato" }, 404);

    let resultsRequest = sb.from("circuit_results")
      .select("ranking_group_id,tournament_name,tournament_type,tournament_date,player_name,points,placement")
      .eq("circuit_id", circuitResult.data.id)
      .eq("source_tournament_id", tournamentId);
    if (requestedGroup) resultsRequest = resultsRequest.eq("ranking_group_id", requestedGroup);
    const resultsQuery = await resultsRequest;
    if (resultsQuery.error) throw new Error("Risultati non disponibili");
    const rows = resultsQuery.data ?? [];
    if (!rows.length) return editorialJson({ error: "Tappa non trovata" }, 404);
    const groupIds = [...new Set(rows.map((row) => row.ranking_group_id))];
    if (groupIds.length !== 1) return editorialJson({ error: "Specifica la classifica della tappa" }, 409);

    const groupResult = await sb.from("circuit_ranking_groups")
      .select("id,circuit_id,category,level")
      .eq("id", groupIds[0])
      .eq("circuit_id", circuitResult.data.id)
      .maybeSingle();
    if (groupResult.error) throw new Error("Classifica non disponibile");
    if (!groupResult.data) return editorialJson({ error: "Tappa non trovata" }, 404);

    const tournamentResult = await sb.from("tournaments")
      .select("id,circuit_id,category,level,time,location")
      .eq("id", tournamentId)
      .eq("circuit_id", circuitResult.data.id)
      .maybeSingle();
    if (tournamentResult.error) throw new Error("Tappa non disponibile");
    const detail = buildCircuitStageDetail(
      tournamentId, rows as CircuitStageResultRow[], groupResult.data.level, tournamentResult.data,
    );
    if (!detail) return editorialJson({ error: "Dati della tappa incoerenti" }, 409);

    return editorialJson({
      circuit: circuitResult.data,
      group: { id: groupResult.data.id, category: groupResult.data.category, level: groupResult.data.level },
      ...detail,
    });
  } catch {
    return editorialJson({ error: "Tappa temporaneamente non disponibile" }, 503);
  }
}
