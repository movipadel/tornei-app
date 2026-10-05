import { guardOperatorPermission } from "@/lib/operatorAuthorization";
import { editorialJson } from "@/lib/padelleriaServer";
import { parsePlayerMatchCriteria } from "@/lib/playerMatching";
import { findPlayerMatches } from "@/lib/playerMatchingServer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await guardOperatorPermission("players.manage");
  if (denied) return denied;
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return editorialJson({ error: "Origine non consentita" }, 403);
  try {
    const criteria = parsePlayerMatchCriteria(await req.json().catch(() => null));
    const data = await findPlayerMatches(criteria);
    return editorialJson({ data, threshold: 50, limit: 20, normalized: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ricerca non disponibile";
    const badRequest = /non valid|Indica un solo/.test(message);
    return editorialJson({ error: message }, badRequest ? 400 : 503);
  }
}
