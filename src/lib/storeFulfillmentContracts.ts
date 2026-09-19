import { NextResponse } from "next/server";
import { getStaffSessionFromCookie } from "@/lib/staffSession";
import { isUuid, mapMovibackRpcError } from "@/lib/movibackContracts";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type StoreFulfillmentAction = "ready" | "deliver" | "cancel";

const RPC_BY_ACTION: Record<StoreFulfillmentAction, string> = {
  ready: "mark_physical_store_order_ready",
  deliver: "deliver_physical_store_order",
  cancel: "cancel_physical_store_order",
};

const STORE_ERROR_MAP: Record<string, { status: number; message: string }> = {
  PF08_INVALID_STORE_ORDER: { status: 404, message: "Ordine non trovato" },
  PF08_INVALID_STORE_ORDER_TRANSITION: {
    status: 409,
    message: "Azione non disponibile per lo stato corrente",
  },
  PF08_STORE_ORDER_ORIGIN_CONFLICT: {
    status: 409,
    message: "Origine ordine da verificare manualmente",
  },
  PF08_FULFILLMENT_LINK_CONFLICT: {
    status: 409,
    message: "Collegamento premio-ordine da verificare manualmente",
  },
  PF08_STORE_CANCELLATION_DEFERRED: {
    status: 409,
    message:
      "Annullamento Store non disponibile: stock e pagamento richiedono verifica manuale",
  },
};

function mapStoreFulfillmentError(error: unknown) {
  const raw =
    typeof error === "string"
      ? error
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";
  const code = raw.match(/PF08_[A-Z0-9_]+/)?.[0];
  const storeMapped = code ? STORE_ERROR_MAP[code] : undefined;
  if (code && storeMapped) return { code, ...storeMapped };
  return mapMovibackRpcError(error);
}

export async function runStoreFulfillmentCommand(
  req: Request,
  orderId: string,
  action: StoreFulfillmentAction
) {
  const session = await getStaffSessionFromCookie();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const idempotencyKey = String(body?.idempotency_key ?? "").trim();
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!isUuid(session.sid) || !isUuid(orderId) || !isUuid(idempotencyKey)) {
    return NextResponse.json(
      { error: "Richiesta non valida", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }
  if (action === "cancel" && !reason) {
    return NextResponse.json(
      { error: "Motivazione richiesta", code: "REASON_REQUIRED" },
      { status: 400 }
    );
  }

  const args: Record<string, string> = {
    p_actor_id: session.sid,
    p_idempotency_key: idempotencyKey,
    p_order_id: orderId,
  };
  if (action === "cancel") args.p_reason = reason;

  const { data, error } = await supabaseAdmin().rpc(RPC_BY_ACTION[action], args);
  if (error || !data) {
    const mapped = mapStoreFulfillmentError(error);
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status }
    );
  }

  return NextResponse.json({ ok: true, ...data });
}
