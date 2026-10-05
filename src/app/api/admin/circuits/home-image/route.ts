import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { guardOperatorPermission } from "@/lib/operatorAuthorization";
import { imageExtension } from "@/lib/padelleria";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = "circuit-home-images";
const PATH_PATTERN = /^home\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;

function pathFromPublicUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const path = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    return PATH_PATTERN.test(path) ? path : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const denied = await guardOperatorPermission("circuits.manage");
  if (denied) return denied;

  try {
    if (Number(req.headers.get("content-length") ?? 0) > 6 * 1024 * 1024) {
      return NextResponse.json({ error: "Richiesta troppo grande" }, { status: 413 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Immagine obbligatoria" }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = imageExtension(bytes, file.type);
    const path = `home/${randomUUID()}.${extension}`;
    const sb = supabaseAdmin();
    const uploaded = await sb.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });

    if (uploaded.error) {
      return NextResponse.json({ error: uploaded.error.message }, { status: 500 });
    }

    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ path, url: data.publicUrl }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Errore upload immagine";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const denied = await guardOperatorPermission("circuits.manage");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const path = pathFromPublicUrl(body?.url);
  if (!path) {
    return NextResponse.json({ error: "Immagine circuito non valida" }, { status: 400 });
  }

  const { error } = await supabaseAdmin().storage.from(BUCKET).remove([path]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
