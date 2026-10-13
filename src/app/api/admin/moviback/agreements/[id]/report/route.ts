import { NextResponse } from "next/server";
import {
  OperatorAccessDenied,
  requireOperatorPermission,
} from "@/lib/operatorAuthorization";
import { safeDatabaseError } from "@/lib/movibackAgreementAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireOperatorPermission("moviback.manage");
  } catch (error) {
    const unauthenticated =
      error instanceof OperatorAccessDenied && error.code === "OPERATOR_REQUIRED";
    return NextResponse.json(
      { error: unauthenticated ? "Authentication required" : "Forbidden" },
      { status: unauthenticated ? 401 : 403 },
    );
  }

  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Convenzione non valida" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin().rpc(
    "get_moviback_agreement_report",
    { p_agreement_id: id },
  );
  if (error) {
    const missing = error.message.includes("MOVIBACK_AGREEMENT_NOT_FOUND");
    return NextResponse.json(
      { error: missing ? "Convenzione non trovata" : safeDatabaseError(error) },
      { status: missing ? 404 : 500 },
    );
  }
  return NextResponse.json({ data });
}
