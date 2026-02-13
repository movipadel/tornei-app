import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

async function compactPositions(
  sb: ReturnType<typeof supabaseAdmin>,
  tournamentId: string,
  isReserve: boolean
) {
  const { data, error } = await sb
    .from("tournament_registrations")
    .select("id,position,created_at")
    .eq("tournament_id", tournamentId)
    .eq("is_reserve", isReserve)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  for (let i = 0; i < rows.length; i++) {
    const want = i + 1;
    if (rows[i].position !== want) {
      const { error: uerr } = await sb
        .from("tournament_registrations")
        .update({ position: want })
        .eq("id", rows[i].id);

      if (uerr) throw new Error(uerr.message);
    }
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ regId: string }> }) {
  const denied = guardAdmin(req);
if (denied) return denied;
  const ok = await isAdminAuthed();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { regId } = await ctx.params;
  const body = await req.json();

  const sb = supabaseAdmin();

  // Recupero record corrente
  const { data: reg, error: rerr } = await sb
    .from("tournament_registrations")
    .select("id,tournament_id,is_reserve,position")
    .eq("id", regId)
    .single();

  if (rerr || !reg) return NextResponse.json({ error: rerr?.message ?? "Not found" }, { status: 404 });

  const newIsReserve = body.is_reserve !== undefined ? Boolean(body.is_reserve) : reg.is_reserve;

  // Se cambia lista: posizione in coda alla nuova lista
  let newPosition = reg.position;

  if (newIsReserve !== reg.is_reserve) {
    const { data: lastPosRow, error: perr } = await sb
      .from("tournament_registrations")
      .select("position")
      .eq("tournament_id", reg.tournament_id)
      .eq("is_reserve", newIsReserve)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (perr) return NextResponse.json({ error: perr.message }, { status: 500 });

    newPosition = (lastPosRow?.position ?? 0) + 1;
  }

  const { error: uerr } = await sb
    .from("tournament_registrations")
    .update({ is_reserve: newIsReserve, position: newPosition })
    .eq("id", reg.id);

  if (uerr) return NextResponse.json({ error: uerr.message }, { status: 500 });

  // Ricompattamento
  await compactPositions(sb, reg.tournament_id, false);
  await compactPositions(sb, reg.tournament_id, true);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ regId: string }> }) {
  const denied = guardAdmin(req);
if (denied) return denied;
  const ok = await isAdminAuthed();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { regId } = await ctx.params;
  const sb = supabaseAdmin();

  // recupero tournament_id prima di cancellare per ricompattare dopo
  const { data: reg, error: rerr } = await sb
    .from("tournament_registrations")
    .select("id,tournament_id")
    .eq("id", regId)
    .single();

  if (rerr || !reg) return NextResponse.json({ error: rerr?.message ?? "Not found" }, { status: 404 });

  const { error: derr } = await sb
    .from("tournament_registrations")
    .delete()
    .eq("id", regId);

  if (derr) return NextResponse.json({ error: derr.message }, { status: 500 });

  // Ricompattamento dopo delete
  await compactPositions(sb, reg.tournament_id, false);
  await compactPositions(sb, reg.tournament_id, true);

  return NextResponse.json({ ok: true });
}
