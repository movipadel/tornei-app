import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStaffSessionOrNull, guardStaff } from "@/lib/staffGuard";
import { isUuid, mapMovibackRpcError } from "@/lib/movibackContracts";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };
type LifecycleAction = "process" | "ready" | "deliver" | "cancel" | "reject";

const RPC_BY_ACTION: Record<LifecycleAction, string> = {
  process: "process_moviback_redemption",
  ready: "ready_moviback_redemption",
  deliver: "deliver_moviback_redemption",
  cancel: "cancel_moviback_redemption",
  reject: "reject_moviback_redemption",
};

export async function POST(req: Request, { params }: Params) {
  const denied = await guardStaff();
  if (denied) return denied;

  const session = await getStaffSessionOrNull();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "") as LifecycleAction;
  const idempotencyKey = String(body?.idempotency_key ?? "").trim();
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (
    !session ||
    !isUuid(session.sid) ||
    !isUuid(id) ||
    !isUuid(idempotencyKey) ||
    !(action in RPC_BY_ACTION)
  ) {
    return NextResponse.json(
      { error: "Richiesta non valida", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  if ((action === "cancel" || action === "reject") && !reason) {
    return NextResponse.json(
      { error: "Motivazione richiesta", code: "REASON_REQUIRED" },
      { status: 400 }
    );
  }

  const args: Record<string, string> = {
    p_actor_id: session.sid,
    p_idempotency_key: idempotencyKey,
    p_redemption_id: id,
  };
  if (action === "cancel" || action === "reject") args.p_reason = reason;

  const { data, error } = await supabaseAdmin().rpc(RPC_BY_ACTION[action], args);

  if (error || !data) {
    const mapped = mapMovibackRpcError(error);
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status }
    );
  }

  return NextResponse.json({ ok: true, ...data });
}
