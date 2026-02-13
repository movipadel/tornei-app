import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin(req);
  if (denied) return denied;


  const { id } = await ctx.params;
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("tournament_registrations")
    .select("id,tournament_id,position,is_reserve,p1_name,p1_phone,p1_gender,p2_name,p2_phone,p2_gender,notes,created_at")
    .eq("tournament_id", id)
    .order("is_reserve", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all = data ?? [];
  return NextResponse.json({
    main: all.filter((r) => !r.is_reserve),
    reserve: all.filter((r) => r.is_reserve),
  });
}

/**
 * ✅ Elimina TUTTE le iscrizioni del torneo (principale + riserva)
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin(req);
  if (denied) return denied;


  const { id } = await ctx.params;
  const sb = supabaseAdmin();

  const { error } = await sb
    .from("tournament_registrations")
    .delete()
    .eq("tournament_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true }, { status: 200 });
}
