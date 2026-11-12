import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

type AdminClient = ReturnType<typeof supabaseAdmin>;

function asSafeBalance(value: unknown): number {
  const balance = Number(value);
  if (!Number.isSafeInteger(balance)) throw new Error("Saldo MoviBack fuori intervallo");
  return balance;
}

/** All ledger rows count; transaction-list pagination never affects the balance. */
export async function getMovibackBalances(sb: AdminClient, membershipIds: string[]): Promise<Map<string, number>> {
  if (membershipIds.length === 0) return new Map();
  const { data, error } = await sb.rpc("get_moviback_points_balances", { p_membership_ids: membershipIds });
  if (error) throw new Error(`Saldo MoviBack non disponibile: ${error.message}`);
  const balances = new Map(membershipIds.map((id) => [id, 0]));
  for (const row of data ?? []) {
    if (row.membership_id && balances.has(row.membership_id)) {
      balances.set(row.membership_id, asSafeBalance(row.points_balance));
    }
  }
  return balances;
}

export async function getMovibackBalance(sb: AdminClient, membershipId: string): Promise<number> {
  return (await getMovibackBalances(sb, [membershipId])).get(membershipId) ?? 0;
}

export async function getMovibackGlobalBalance(sb: AdminClient): Promise<number> {
  const { data, error } = await sb.rpc("get_moviback_points_balances", { p_membership_ids: null });
  if (error) throw new Error(`Saldo MoviBack non disponibile: ${error.message}`);
  return asSafeBalance(data?.[0]?.points_balance ?? 0);
}
