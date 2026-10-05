import "server-only";
import { redirect } from "next/navigation";
import { OperatorAccessDenied, requireOperatorPermission } from "@/lib/operatorAuthorization";
import type { OperatorPermissionKey } from "@/lib/operatorPermissions";

export async function requireOperatorPagePermission(permission: OperatorPermissionKey) {
  try {
    return await requireOperatorPermission(permission);
  } catch (error) {
    if (error instanceof OperatorAccessDenied) {
      if (error.code === "OPERATOR_REQUIRED") redirect("/admin/login");
      redirect(`/operator-access-denied?permission=${encodeURIComponent(permission)}`);
    }
    throw error;
  }
}
