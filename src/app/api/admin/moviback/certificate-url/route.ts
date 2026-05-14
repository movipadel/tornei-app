import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

const BUCKET = "medical-certificates";

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const certificateId = String(body.certificate_id ?? "").trim();

  if (!certificateId) {
    return NextResponse.json({ error: "Certificato mancante" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: cert, error: certErr } = await sb
    .from("medical_certificates")
    .select("id,file_path")
    .eq("id", certificateId)
    .single();

  if (certErr || !cert) {
    return NextResponse.json(
      { error: certErr?.message || "Certificato non trovato" },
      { status: 404 }
    );
  }

  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(cert.file_path, 60 * 5);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    url: data.signedUrl,
  });
}