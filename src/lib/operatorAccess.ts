export type OperatorRole = "admin" | "staff";

export function operatorRoleFromResponse(ok: boolean, payload: unknown): OperatorRole | null {
  if (!ok || !payload || typeof payload !== "object") return null;
  const result = payload as { authed?: unknown; role?: unknown };
  if (result.authed !== true) return null;
  return result.role === "admin" || result.role === "staff" ? result.role : null;
}

export function operatorDestination(role: OperatorRole) {
  return role === "admin" ? "/admin" : "/staff";
}
