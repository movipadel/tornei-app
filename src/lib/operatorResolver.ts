import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  resolveOperatorIdentity,
  type OperatorRecord,
} from "@/lib/operatorAuthorizationCore";

export async function resolveOperatorFromSession(session: { sid?: string } | null) {
  return resolveOperatorIdentity(session, async (id) => {
    const { data, error } = await supabaseAdmin()
      .from("staff_users")
      .select("id,full_name,email,role,is_active")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as OperatorRecord | null;
  });
}
