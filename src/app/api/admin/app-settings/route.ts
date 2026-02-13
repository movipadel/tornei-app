import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";


export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = guardAdmin(req);
  if (denied) return denied;

  const ok = await isAdminAuthed();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("app_settings")
    .select("id,home_title,home_subtitle,home_logo_url,updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // se non c'è riga, ritorna default (senza creare)
  return NextResponse.json(
    data ?? {
      id: null,
      home_title: "Tornei",
      home_subtitle: "Iscriviti ai tornei Movi e gestisci le tue iscrizioni",
      home_logo_url: null,
    }
  );
}

export async function PUT(req: Request) {
  const denied = guardAdmin(req);
if (denied) return denied;
  const ok = await isAdminAuthed();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const home_title = String(body.home_title ?? "").trim() || "Tornei";
  const home_subtitle =
    String(body.home_subtitle ?? "").trim() ||
    "Iscriviti ai tornei Movi e gestisci le tue iscrizioni";
  const home_logo_url = body.home_logo_url ? String(body.home_logo_url) : null;

  const sb = supabaseAdmin();

  // prendo (eventuale) riga esistente
  const { data: existing, error: e1 } = await sb
    .from("app_settings")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const payload = {
    home_title,
    home_subtitle,
    home_logo_url,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = existing?.id
    ? await sb.from("app_settings").update(payload).eq("id", existing.id).select("*").single()
    : await sb.from("app_settings").insert(payload).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
