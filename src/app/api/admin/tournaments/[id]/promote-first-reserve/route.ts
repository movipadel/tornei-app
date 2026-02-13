import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin(req);
if (denied) return denied;
  const ok = await isAdminAuthed();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  const sb = supabaseAdmin();

  // prima riserva (position più bassa)
  const { data: first, error: ferr } = await sb
    .from("tournament_registrations")
    .select("id")
    .eq("tournament_id", id)
    .eq("is_reserve", true)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ferr) return NextResponse.json({ error: ferr.message }, { status: 500 });
  if (!first) return NextResponse.json({ error: "Nessuna riserva" }, { status: 400 });

  // ultima posizione in main
  const { data: lastMain, error: lerr } = await sb
    .from("tournament_registrations")
    .select("position")
    .eq("tournament_id", id)
    .eq("is_reserve", false)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lerr) return NextResponse.json({ error: lerr.message }, { status: 500 });

  const newPos = (lastMain?.position ?? 0) + 1;

  const { error: uerr } = await sb
    .from("tournament_registrations")
    .update({ is_reserve: false, position: newPos })
    .eq("id", first.id);

  if (uerr) return NextResponse.json({ error: uerr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
