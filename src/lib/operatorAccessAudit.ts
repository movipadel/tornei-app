import "server-only";
import { isOperatorPermissionKey, type OperatorPermissionKey } from "@/lib/operatorPermissions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { OperatorRole } from "@/lib/operatorAuthorizationCore";

export type OperatorAccessAuditInput = {
  targetStaffUserId: string;
  actorStaffUserId?: string | null;
  action: string;
  oldRole?: OperatorRole | null;
  newRole?: OperatorRole | null;
  permissionsAdded?: OperatorPermissionKey[];
  permissionsRemoved?: OperatorPermissionKey[];
  requestId?: string | null;
};

export async function recordOperatorAccessAudit(input: OperatorAccessAuditInput) {
  if (!input.action.trim()) throw new Error("Operator audit action required");
  const added = input.permissionsAdded ?? [];
  const removed = input.permissionsRemoved ?? [];
  if (![...added, ...removed].every(isOperatorPermissionKey)) {
    throw new Error("Unknown operator permission");
  }
  const { data, error } = await supabaseAdmin()
    .from("operator_access_audit_events")
    .insert({
      target_staff_user_id: input.targetStaffUserId,
      actor_staff_user_id: input.actorStaffUserId ?? null,
      action: input.action.trim(),
      old_role: input.oldRole ?? null,
      new_role: input.newRole ?? null,
      permissions_added: added,
      permissions_removed: removed,
      request_id: input.requestId ?? null,
    })
    .select("id,created_at")
    .single();
  if (error) throw error;
  return data;
}
