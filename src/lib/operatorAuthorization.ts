import "server-only";
import { NextResponse } from "next/server";
import { getStaffSessionFromCookie } from "@/lib/staffSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  operatorHasPermission,
  type CurrentOperator,
} from "@/lib/operatorAuthorizationCore";
import { resolveOperatorFromSession } from "@/lib/operatorResolver";
import {
  OPERATOR_PERMISSIONS,
  isOperatorPermissionKey,
  type OperatorPermissionKey,
} from "@/lib/operatorPermissions";

export class OperatorAccessDenied extends Error {
  constructor(public readonly code: "OPERATOR_REQUIRED" | "PERMISSION_DENIED") {
    super(code);
    this.name = "OperatorAccessDenied";
  }
}

export async function getCurrentOperator(): Promise<CurrentOperator | null> {
  const session = await getStaffSessionFromCookie();
  if (!session) return null;
  try {
    return await resolveOperatorFromSession(session);
  } catch (error) {
    console.error("Operator resolution failed", error);
    return null;
  }
}

export async function requireOperator(): Promise<CurrentOperator> {
  const operator = await getCurrentOperator();
  if (!operator) throw new OperatorAccessDenied("OPERATOR_REQUIRED");
  return operator;
}

export async function requireOperatorPermission(
  permissionKey: OperatorPermissionKey | string,
): Promise<CurrentOperator> {
  if (!isOperatorPermissionKey(permissionKey)) {
    throw new OperatorAccessDenied("PERMISSION_DENIED");
  }
  const operator = await requireOperator();
  const allowed = await operatorHasPermission(
    operator,
    permissionKey,
    isOperatorPermissionKey,
    async (staffUserId, key) => {
      const { data, error } = await supabaseAdmin()
        .from("staff_permissions")
        .select("staff_user_id")
        .eq("staff_user_id", staffUserId)
        .eq("permission_key", key)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  );
  if (!allowed) throw new OperatorAccessDenied("PERMISSION_DENIED");
  return operator;
}

export async function getEffectiveOperatorPermissions(
  operator: CurrentOperator,
): Promise<OperatorPermissionKey[]> {
  if (operator.role === "admin") {
    return OPERATOR_PERMISSIONS.map((permission) => permission.key);
  }

  const { data, error } = await supabaseAdmin()
    .from("staff_permissions")
    .select("permission_key")
    .eq("staff_user_id", operator.sid);
  if (error) throw error;

  const granted = new Set(
    (data ?? [])
      .map((row) => row.permission_key)
      .filter(isOperatorPermissionKey),
  );
  return OPERATOR_PERMISSIONS
    .map((permission) => permission.key)
    .filter((key) => granted.has(key));
}

export async function guardOperatorPermission(permissionKey: OperatorPermissionKey) {
  try {
    await requireOperatorPermission(permissionKey);
    return null;
  } catch (error) {
    if (error instanceof OperatorAccessDenied) {
      return NextResponse.json(
        { error: error.code === "OPERATOR_REQUIRED" ? "Authentication required" : "Forbidden" },
        { status: error.code === "OPERATOR_REQUIRED" ? 401 : 403 },
      );
    }
    throw error;
  }
}

export async function guardOperatorAnyPermission(permissionKeys: readonly OperatorPermissionKey[]) {
  for (const permissionKey of permissionKeys) {
    try {
      await requireOperatorPermission(permissionKey);
      return null;
    } catch (error) {
      if (!(error instanceof OperatorAccessDenied)) throw error;
      if (error.code === "OPERATOR_REQUIRED") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
    }
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
