import { redirect } from "next/navigation";
import { StaffDashboard } from "./StaffDashboard";
import {
  getEffectiveOperatorPermissions,
  requireOperator,
  requireOperatorPermission,
} from "@/lib/operatorAuthorization";
import { OPERATOR_PERMISSIONS } from "@/lib/operatorPermissions";

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; reward?: string }>;
}) {
  const query = await searchParams;
  if (query.code || query.reward) {
    await requireOperatorPermission("scanner.manage");
    const next = new URLSearchParams();
    if (query.code) next.set("code", query.code);
    if (query.reward) next.set("reward", query.reward);
    redirect(`/staff/operations?${next.toString()}`);
  }

  const operator = await requireOperator();
  const effectivePermissions = await getEffectiveOperatorPermissions(operator);
  const allowed = new Set(effectivePermissions);
  const modules = OPERATOR_PERMISSIONS.filter((permission) => allowed.has(permission.key));
  return <StaffDashboard operator={operator} modules={modules} />;
}
