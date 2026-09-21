import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { getStaffSessionFromCookie } from "@/lib/staffSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const session = await getStaffSessionFromCookie();
  const body = await request.json().catch(() => ({}));
  if (body.confirmation !== "MERGE") return NextResponse.json({ error: "Conferma esplicita richiesta" }, { status: 400 });
  const source = String(body.source_user_id ?? "");
  const canonical = String(body.canonical_user_id ?? "");
  const groupId = String(body.group_id ?? "");
  const fingerprint = String(body.fingerprint ?? "");
  if (!source || !canonical || !groupId || !fingerprint) return NextResponse.json({ error: "Dati merge mancanti" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: group } = await sb.from("user_duplicate_review_groups").select("state,canonical_user_id").eq("id", groupId).maybeSingle();
  if (group?.state !== "approved" || group.canonical_user_id !== canonical) {
    return NextResponse.json({ error: "Il gruppo non è approvato per questo canonico" }, { status: 409 });
  }
  const { data: approvedMembers, error: membersError } = await sb.from("user_duplicate_review_members")
    .select("user_id,included").eq("group_id", groupId).in("user_id", [source, canonical]);
  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 409 });
  if (source === canonical || approvedMembers?.length !== 2 || approvedMembers.some((member) => !member.included)) {
    return NextResponse.json({ error: "Sorgente e canonico devono essere membri inclusi del gruppo approvato" }, { status: 409 });
  }
  const { data: freshPreview, error: previewError } = await sb.rpc("preview_user_merge", {
    p_source_user_id: source, p_canonical_user_id: canonical,
  });
  if (previewError) return NextResponse.json({ error: previewError.message }, { status: 409 });
  if ((freshPreview as { fingerprint?: string } | null)?.fingerprint !== fingerprint) {
    return NextResponse.json({ error: "STALE_PREVIEW", data: freshPreview }, { status: 409 });
  }
  const { data: created, error: createError } = await sb.rpc("create_user_merge_operation", {
    p_source_user_id: source, p_canonical_user_id: canonical, p_actor_staff_id: session!.sid,
    p_reason: String(body.reason ?? "Merge duplicato approvato").trim(), p_candidate_group_id: groupId,
  });
  if (createError) return NextResponse.json({ error: createError.message }, { status: 409 });
  const operation = created as { operation_id: string; preview: { fingerprint: string } };
  if (operation.preview.fingerprint !== fingerprint) {
    return NextResponse.json({ error: "STALE_PREVIEW", data: operation.preview }, { status: 409 });
  }
  const { data, error } = await sb.rpc("execute_user_merge", {
    p_operation_id: operation.operation_id, p_expected_fingerprint: fingerprint, p_actor_staff_id: session!.sid,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  const state = (data as { state?: string } | null)?.state;
  return NextResponse.json({ data }, { status: state === "completed" ? 200 : 409 });
}
