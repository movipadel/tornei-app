import { getCurrentMoviUser } from "@/lib/currentMoviUser";
import { editorialJson } from "@/lib/padelleriaServer";
import { buildPersonalCircuitStages, resolvePersonalCircuit, type PersonalCircuitResult } from "@/lib/personalCircuit";
import { resolvePlayerIdentityScope } from "@/lib/playerIdentityServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildPublicCircuitRanking } from "@/lib/circuitPublicRanking";
import { ownsCircuitResult } from "@/lib/playerIdentity";

export const dynamic = "force-dynamic";
const RESULT_CAP = 900;

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const identity = await getCurrentMoviUser();
  if (identity.conflict_state) return editorialJson({ state: "review_required", error: "Sessione in conflitto" }, 409);
  if (!identity.public_user_id) return editorialJson({ state: "anonymous", error: "Accedi per vedere la tua classifica" }, 401);

  const { slug } = await ctx.params;
  const search = new URL(req.url).searchParams;
  const groupId = search.get("group");
  if (!slug || !groupId || [...search.keys()].some((key) => key !== "group")) {
    return editorialJson({ error: "Parametri non validi" }, 400);
  }

  try {
    const sb = supabaseAdmin();
    const circuitResult = await sb.from("circuits").select("id,slug,status").eq("slug", slug).maybeSingle();
    if (circuitResult.error) throw new Error("Circuito non disponibile");
    if (!circuitResult.data) return editorialJson({ error: "Circuito non trovato" }, 404);

    const groupResult = await sb.from("circuit_ranking_groups")
      .select("id,circuit_id,category,level")
      .eq("id", groupId)
      .eq("circuit_id", circuitResult.data.id)
      .maybeSingle();
    if (groupResult.error) throw new Error("Classifica non disponibile");
    if (!groupResult.data) return editorialJson({ error: "Classifica non trovata" }, 404);

    const [{ playerIds, legacyKeys }, resultQuery] = await Promise.all([
      resolvePlayerIdentityScope(identity.public_user_id),
      sb.from("circuit_results")
        .select("ranking_group_id,source_tournament_id,tournament_name,tournament_date,player_key,player_name,player_identity_id,points,placement")
        .eq("circuit_id", circuitResult.data.id)
        .eq("ranking_group_id", groupId)
        .limit(RESULT_CAP + 1),
    ]);
    if (resultQuery.error || !resultQuery.data || resultQuery.data.length > RESULT_CAP) throw new Error("Risultati non disponibili");

    const rows = resultQuery.data as PersonalCircuitResult[];
    const resolution = resolvePersonalCircuit(rows, playerIds, legacyKeys, { buildPublicCircuitRanking, ownsCircuitResult });
    const group = { id: groupResult.data.id, category: groupResult.data.category, level: groupResult.data.level };
    if (resolution.state === "empty") {
      return editorialJson({ state: "empty", group, message: "Non hai ancora giocato tappe in questa classifica.", stages: [] });
    }
    if (resolution.state === "review_required") {
      return editorialJson({ state: "review_required", group, message: "Classifica personale da verificare", stages: [] });
    }

    const tournamentIds = [...new Set(resolution.ownedRows.flatMap((row) => row.source_tournament_id ? [row.source_tournament_id] : []))];
    const tournamentResult = tournamentIds.length
      ? await sb.from("tournaments")
        .select("id,name,date,time,location,category,level,circuit_id")
        .in("id", tournamentIds)
        .eq("circuit_id", circuitResult.data.id)
      : { data: [], error: null };
    if (tournamentResult.error) throw new Error("Tappe non disponibili");

    const stageResolution = buildPersonalCircuitStages(resolution.ownedRows, tournamentResult.data ?? []);
    if (stageResolution.state === "review_required") {
      return editorialJson({ state: "review_required", group, message: "Classifica personale da verificare", stages: [] });
    }

    return editorialJson({
      state: "ready",
      group,
      position: {
        position: resolution.rank.position,
        points: resolution.rank.total_points,
        events_played: resolution.rank.events_played,
        total_ranked_players: resolution.totalRankedPlayers,
      },
      stages: stageResolution.stages,
    });
  } catch {
    return editorialJson({ error: "Classifica personale temporaneamente non disponibile. Riprova." }, 503);
  }
}
