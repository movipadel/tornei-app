import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const { data, error } = await supabaseAdmin().rpc("enqueue_moviback_certificate_expiry_events");
  if (error) {
    console.error("MoviBack certificate expiry scan failed", error.code);
    return NextResponse.json({ error: "Scansione non disponibile" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, events_created: data });
}
