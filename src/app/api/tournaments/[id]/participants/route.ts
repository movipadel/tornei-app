import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type RegRow = {
  is_reserve: boolean;
  p1_name: string | null;
  p2_name: string | null;
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await ctx.params;
  const sb = supabaseAdmin();

  // 1) Leggo torneo: tipo + flag show_participants
  const { data: t, error: tErr } = await sb
    .from("tournaments")
    .select("id,type,show_participants")
    .eq("id", tournamentId)
    .maybeSingle();

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!t?.id) return NextResponse.json({ error: "Torneo non trovato" }, { status: 404 });

  const show = Boolean((t as any).show_participants);
  if (!show) {
    return NextResponse.json({ type: t.type, names: [], pairs: [] });
  }

  // 2) Leggo iscrizioni (solo main)
  const { data: regs, error: rErr } = await sb
    .from("tournament_registrations")
    .select("is_reserve,p1_name,p2_name")
    .eq("tournament_id", tournamentId)
    .order("position", { ascending: true });

  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const main = (regs ?? []).filter((r: RegRow) => !r.is_reserve);

  const type = String((t as any).type ?? "");

  // BARAONDA: nomi singoli (p1_name)
  if (type.toLowerCase() === "baraonda") {
    const names = main
      .map((r: RegRow) => String(r.p1_name ?? "").trim())
      .filter(Boolean);

    return NextResponse.json({ type: t.type, names, pairs: [] });
  }

  // COPPIE FISSE: coppie (p1 + p2)
  // - se manca p2, non mostriamo la coppia (evitiamo righe “monche”)
  const pairs = main
    .map((r: RegRow) => ({
      p1: String(r.p1_name ?? "").trim(),
      p2: String(r.p2_name ?? "").trim(),
    }))
    .filter((p) => p.p1 && p.p2);

  return NextResponse.json({ type: t.type, names: [], pairs });
}