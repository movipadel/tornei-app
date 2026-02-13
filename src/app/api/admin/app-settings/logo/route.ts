import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

const BUCKET = "public-assets"; // nome bucket (creato al volo se manca)

export async function POST(req: Request) {
  const denied = await guardAdmin(req);
if (denied) return denied;
  const ok = await isAdminAuthed();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File mancante" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // crea bucket se non esiste
  const { data: buckets, error: berr } = await sb.storage.listBuckets();
  if (berr) return NextResponse.json({ error: berr.message }, { status: 500 });

  const exists = (buckets ?? []).some((b) => b.name === BUCKET);
  if (!exists) {
    const { error: cerr } = await sb.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
    });
    if (cerr) return NextResponse.json({ error: cerr.message }, { status: 500 });
  }

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `logos/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const { error: uerr } = await sb.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type || "image/png",
    upsert: true,
  });
  if (uerr) return NextResponse.json({ error: uerr.message }, { status: 500 });

  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
