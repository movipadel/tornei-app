import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const source = String(body.source_user_id ?? "");
  const canonical = String(body.canonical_user_id ?? "");
  if (!source || !canonical) return NextResponse.json({ error: "Profili mancanti" }, { status: 400 });
  const { data, error } = await supabaseAdmin().rpc("preview_user_merge", {
    p_source_user_id: source, p_canonical_user_id: canonical,
  });
  return error ? NextResponse.json({ error: error.message }, { status: 409 }) : NextResponse.json({ data });
}
