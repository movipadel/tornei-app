import type { OperatorPermissionKey } from "@/lib/operatorPermissions";

export const DELEGATED_ADMIN_PAGE_PREFIXES = [
  ["/admin/tournaments", "tournaments.manage"],
  ["/admin/circuits", "circuits.manage"],
  ["/admin/players", "players.manage"],
  ["/admin/requests", "requests.manage"],
  ["/admin/padelleria", "padelleria.manage"],
  ["/admin/comunicazioni", "communications.manage"],
  ["/admin/moviback", "moviback.manage"],
  ["/admin/partners", "partners.manage"],
  ["/admin/store/products", "store.manage"],
  ["/admin/store-orders", "store.manage"],
  ["/admin/monday-league", "monday_league.manage"],
] as const satisfies ReadonlyArray<readonly [string, OperatorPermissionKey]>;

export function delegatedAdminPagePermission(pathname: string): OperatorPermissionKey | null {
  const match = DELEGATED_ADMIN_PAGE_PREFIXES.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match?.[1] ?? null;
}
