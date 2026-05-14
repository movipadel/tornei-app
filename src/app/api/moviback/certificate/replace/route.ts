import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";

export const runtime = "nodejs";

const BUCKET = "medical-certificates";

function safeFileName(name: string) {
  return String(name || "certificato")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 120);
}

export async function POST(req: Request) {
  const uid = await getUserIdFromCookie();

  if (!uid) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);

  if (!form) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const expiryDate = String(form.get("expiry_date") ?? "").trim();
  const file = form.get("certificate");

  if (!expiryDate) {
    return NextResponse.json({ error: "Scadenza certificato obbligatoria" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Certificato obbligatorio" }, { status: 400 });
  }

  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Formato non valido. Usa PDF, JPG, PNG o WEBP." },
      { status: 400 }
    );
  }

  const maxSize = 8 * 1024 * 1024;

  if (file.size > maxSize) {
    return NextResponse.json(
      { error: "File troppo grande. Massimo 8MB." },
      { status: 400 }
    );
  }

  const sb = supabaseAdmin();

  const cleanName = safeFileName(file.name);
  const filePath = `${uid}/${Date.now()}-${cleanName}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data, error } = await sb
    .from("medical_certificates")
    .insert({
      user_id: uid,
      file_path: filePath,
      expiry_date: expiryDate,
      status: "pending_review",
      uploaded_at: new Date().toISOString(),
      notes: "Nuovo certificato caricato dall'utente",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}