import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const IDENTITY_CAP = 500;

export type PlayerIdentityScope = {
  userIds: string[];
  legacyKeys: string[];
  playerIds: string[];
};

export async function resolvePlayerIdentityScope(userId: string): Promise<PlayerIdentityScope> {
  const sb = supabaseAdmin();
  const scope = await sb.rpc("movi_activity_identity_scope", { p_user_id: userId });
  if (scope.error) throw new Error("Identity unavailable");

  const userIds = Array.isArray(scope.data?.user_ids) ? scope.data.user_ids as string[] : [];
  const legacyKeys = Array.isArray(scope.data?.player_keys) ? scope.data.player_keys as string[] : [];
  const linked = await sb
    .from("player_identities")
    .select("id")
    .in("account_user_id", userIds)
    .neq("status", "merged")
    .limit(IDENTITY_CAP + 1);

  if (linked.error || !linked.data || linked.data.length > IDENTITY_CAP) {
    throw new Error("Identity unavailable");
  }

  return { userIds, legacyKeys, playerIds: linked.data.map((row) => row.id) };
}
