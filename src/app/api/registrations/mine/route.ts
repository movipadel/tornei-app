import { NextResponse } from "next/server";
import { getUserIdFromCookie } from "@/lib/userAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolvePlayerIdentityScope } from "@/lib/playerIdentityServer";
import { ownsTournamentRegistration, type TournamentRegistrationOwnerRow } from "@/lib/tournamentRegistrationOwnership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 500;
const SELECT = "id,tournament_id,is_reserve,user_id,p1_player_identity_id,p2_player_identity_id,p1_phone,p2_phone";
const privateResponse = (data: Array<{ id: string; tournament_id: string; is_reserve: boolean }>) =>
  NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });

export async function GET() {
  const userId = await getUserIdFromCookie();
  if (!userId) return privateResponse([]);

  try {
    const scope = await resolvePlayerIdentityScope(userId);
    if (!scope.userIds.includes(userId)) throw new Error("Registration scope unavailable");
    const sb = supabaseAdmin();
    const canonicalFilters = [`user_id.in.(${scope.userIds.join(",")})`];
    if (scope.playerIds.length) {
      const ids = scope.playerIds.join(",");
      canonicalFilters.push(`p1_player_identity_id.in.(${ids})`, `p2_player_identity_id.in.(${ids})`);
    }
    const canonical = await sb.from("tournament_registrations")
      .select(SELECT).or(canonicalFilters.join(",")).limit(LIMIT + 1);
    if (canonical.error || !canonical.data || canonical.data.length > LIMIT) throw new Error("Registration scope unavailable");

    // A phone is considered only for historical slots with no canonical owner.
    // The scope RPC supplies keys that are unique to this customer family.
    const keys = scope.legacyKeys.filter((key) => /^\d{8,}$/.test(key));
    const historical = keys.length ? await sb.from("tournament_registrations")
      .select(SELECT)
      .or(keys.flatMap((key) => [`p1_phone.ilike.%${key}%`, `p2_phone.ilike.%${key}%`]).join(","))
      .limit(LIMIT + 1) : { data: [], error: null };
    if (historical.error || !historical.data || historical.data.length > LIMIT) throw new Error("Registration scope unavailable");

    const owned = new Map<string, TournamentRegistrationOwnerRow>();
    for (const row of [...canonical.data, ...historical.data] as TournamentRegistrationOwnerRow[]) {
      if (ownsTournamentRegistration(row, { ...scope, legacyKeys: keys })) owned.set(row.id, row);
    }
    return privateResponse([...owned.values()].map(({ id, tournament_id, is_reserve }) => ({ id, tournament_id, is_reserve })));
  } catch (error) {
    console.error("Own tournament registrations unavailable", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Iscrizioni non disponibili" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
