import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { getStaffSessionFromCookie } from "@/lib/staffSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Origine non consentita" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const notes = String(body.notes ?? "").trim();
  if (!id || !["approve", "reject"].includes(action)) return NextResponse.json({ error: "Revisione non valida" }, { status: 400 });
  if (action === "reject" && !notes) return NextResponse.json({ error: "Motivo del rifiuto obbligatorio" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: certificate, error: readError } = await sb.from("medical_certificates").select("id,file_path,status").eq("id", id).maybeSingle();
  if (readError || !certificate) return NextResponse.json({ error: "Certificato non trovato" }, { status: 404 });
  if (!certificate.file_path) return NextResponse.json({ error: "File del certificato non disponibile" }, { status: 400 });
  const signed = await sb.storage.from("medical-certificates").createSignedUrl(certificate.file_path, 60);
  if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ error: "File del certificato non disponibile" }, { status: 400 });

  const session = await getStaffSessionFromCookie();
  const now = new Date().toISOString();
  const { data, error } = await sb.from("medical_certificates").update({
    status: action === "approve" ? "approved" : "rejected",
    reviewed_at: now,
    reviewed_by: session!.sid,
    notes: notes || (action === "approve" ? "Certificato approvato da Admin" : null),
  }).eq("id", id).select("id,status,reviewed_at,reviewed_by,expiry_date,notes").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
