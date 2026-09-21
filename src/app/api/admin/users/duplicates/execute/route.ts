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
  if (body.confirmation !== "MERGE") {
    return NextResponse.json({ error: "Conferma esplicita richiesta" }, { status: 400 });
  }
  const source = String(body.source_user_id ?? "");
  const canonical = String(body.canonical_user_id ?? "");
  const groupId = String(body.group_id ?? "");
  const fingerprint = String(body.fingerprint ?? "");
  const reason = String(body.reason ?? "Merge duplicato approvato").trim();
  if (!source || !canonical || !groupId || !fingerprint || !reason) {
    return NextResponse.json({ error: "Dati merge mancanti" }, { status: 400 });
  }
  const sb = supabaseAdmin();
  const { data: freshPreview, error: previewError } = await sb.rpc("preview_reviewed_user_merge", {
    p_group_id: groupId,
    p_source_user_id: source,
    p_canonical_user_id: canonical,
  });
  if (previewError) return NextResponse.json({ error: previewError.message }, { status: 409 });
  if ((freshPreview as { fingerprint?: string } | null)?.fingerprint !== fingerprint) {
    return NextResponse.json({ error: "STALE_PREVIEW", data: freshPreview }, { status: 409 });
  }
  const { data: created, error: createError } = await sb.rpc("create_reviewed_user_merge_operation", {
    p_group_id: groupId,
    p_source_user_id: source,
    p_actor_staff_id: session!.sid,
    p_reason: reason,
  });
  if (createError) return NextResponse.json({ error: createError.message }, { status: 409 });
  const operation = created as { operation_id: string; preview: { fingerprint: string } };
  if (operation.preview.fingerprint !== fingerprint) {
    return NextResponse.json({ error: "STALE_PREVIEW", data: operation.preview }, { status: 409 });
  }
  const { data, error } = await sb.rpc("execute_reviewed_user_merge", {
    p_operation_id: operation.operation_id,
    p_expected_fingerprint: fingerprint,
    p_actor_staff_id: session!.sid,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  const state = (data as { state?: string } | null)?.state;
  return NextResponse.json({ data }, { status: state === "completed" ? 200 : 409 });
}
