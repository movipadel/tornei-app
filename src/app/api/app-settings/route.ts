import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("app_settings")
    .select("home_title,home_subtitle,home_logo_url,updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    data ?? {
      home_title: "Tornei",
      home_subtitle: "Iscriviti ai tornei disponibili e gestisci le tue iscrizioni",
      home_logo_url: null,
    }
  );
}
