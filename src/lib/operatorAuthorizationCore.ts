export type OperatorRole = "admin" | "staff";

export type OperatorRecord = {
  id: string;
  full_name: string;
  email: string;
  role: OperatorRole;
  is_active: boolean;
};

export type CurrentOperator = {
  sid: string;
  name: string;
  email: string;
  role: OperatorRole;
};

export async function resolveOperatorIdentity(
  session: { sid?: string } | null,
  loadOperator: (id: string) => Promise<OperatorRecord | null>,
): Promise<CurrentOperator | null> {
  const sid = session?.sid?.trim();
  if (!sid) return null;
  const row = await loadOperator(sid);
  if (!row?.is_active || (row.role !== "admin" && row.role !== "staff")) return null;
  return { sid: row.id, name: row.full_name, email: row.email, role: row.role };
}

export async function operatorHasPermission(
  operator: CurrentOperator,
  permissionKey: string,
  isKnownPermission: (key: string) => boolean,
  hasExplicitGrant: (staffUserId: string, key: string) => Promise<boolean>,
) {
  if (!isKnownPermission(permissionKey)) return false;
  if (operator.role === "admin") return true;
  return hasExplicitGrant(operator.sid, permissionKey);
}
