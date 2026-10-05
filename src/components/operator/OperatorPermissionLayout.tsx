import type { ReactNode } from "react";
import { requireOperatorPagePermission } from "@/lib/operatorPageAuthorization";
import type { OperatorPermissionKey } from "@/lib/operatorPermissions";

export async function OperatorPermissionLayout({ children, permission }: { children: ReactNode; permission: OperatorPermissionKey }) {
  await requireOperatorPagePermission(permission);
  return children;
}
