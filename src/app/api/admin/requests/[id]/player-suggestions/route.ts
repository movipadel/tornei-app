import { giocaMatchingContext, giocaRequestToMatchingCriteria, mergeGiocaMatchResults, supportsGiocaMatching } from "@/lib/giocaMatching";
import { isUuid } from "@/lib/padelleria";
import { editorialOperator, editorialJson } from "@/lib/padelleriaServer";
import { findPlayerMatches } from "@/lib/playerMatchingServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  return editorialOperator(req, 'requests.manage', async () => {
    const { id } = await context.params;
    if (!isUuid(id)) return editorialJson({ error: "ID richiesta non valido" }, 400);
    const sb = supabaseAdmin();
    const requestResult = await sb.from("movi_requests")
      .select("id,user_id,request_type,status,clubs,requested_date,time_window,level,match_type,playing_side,group_size,required_player_side")
      .eq("id", id)
      .maybeSingle();
    if (requestResult.error) throw new Error("Richiesta non disponibile");
    if (!requestResult.data) return editorialJson({ error: "Richiesta non trovata" }, 404);
    if (requestResult.data.request_type !== "gioca") return editorialJson({ error: "I suggerimenti sono disponibili solo per richieste Gioca" }, 409);
    if (!supportsGiocaMatching(requestResult.data as never)) return editorialJson({ error: "La richiesta è già conclusa" }, 409);

    const owner = await sb.from("player_identities")
      .select("id")
      .eq("account_user_id", requestResult.data.user_id)
      .eq("status", "active")
      .is("merged_into_player_id", null)
      .maybeSingle();
    if (owner.error) throw new Error("Identità del richiedente non verificabile");
    const criteria = giocaRequestToMatchingCriteria(requestResult.data as never, owner.data?.id ?? null);
    const data = mergeGiocaMatchResults(await Promise.all(criteria.map(item => findPlayerMatches(item))));
    return editorialJson({ data, context: giocaMatchingContext(criteria, requestResult.data.match_type, requestResult.data.group_size as 1 | 2 | 3), threshold: 50, limit: 20, normalized: true });
  });
}
