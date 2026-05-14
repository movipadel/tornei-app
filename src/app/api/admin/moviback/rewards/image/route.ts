import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

const BUCKET = "reward-images";

function safeFileName(name: string) {
  return String(name || "premio")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 120);
}

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const form = await req.formData().catch(() => null);

  if (!form) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Immagine obbligatoria" }, { status: 400 });
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Formato non valido. Usa JPG, PNG o WEBP." },
      { status: 400 }
    );
  }

  const maxSize = 5 * 1024 * 1024;

  if (file.size > maxSize) {
    return NextResponse.json(
      { error: "Immagine troppo grande. Massimo 5MB." },
      { status: 400 }
    );
  }

  const sb = supabaseAdmin();

  const now = Date.now();
  const cleanName = safeFileName(file.name);
  const filePath = `${now}-${cleanName}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadErr } = await sb.storage.from(BUCKET).upload(filePath, buffer, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data } = sb.storage.from(BUCKET).getPublicUrl(filePath);

  return NextResponse.json({
    ok: true,
    path: filePath,
    url: data.publicUrl,
  });
}