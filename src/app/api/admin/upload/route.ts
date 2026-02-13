import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";
import { requireAdminFromRequest } from "@/lib/adminSession";
import { guardAdmin } from "@/lib/adminGuard";



export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = guardAdmin(req);
if (denied) return denied;
  try {
    if (!requireAdminFromRequest(req)) {
  return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
}
    const supabase = supabaseAdmin();
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File mancante" }, { status: 400 });
    }

    const bucket = String(form.get("bucket") || "tournaments");
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const path = `${randomUUID()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, arrayBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);

    return NextResponse.json({ file_url: data.publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore upload" }, { status: 500 });
  }
}
