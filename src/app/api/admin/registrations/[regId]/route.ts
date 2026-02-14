import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

async function recompact(sb: ReturnType<typeof supabaseAdmin>, tournamentId: string, isReserve: boolean) {
  const { data, error } = await sb
    .from("tournament_registrations")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("is_reserve", isReserve)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  let pos = 1;
  for (const r of rows) {
    const { error: uerr } = await sb
      .from("tournament_registrations")
      .update({ position: pos })
      .eq("id", r.id);
    if (uerr) throw new Error(uerr.message);
    pos += 1;
  }
}

async function getNextMainPosition(sb: ReturnType<typeof supabaseAdmin>, tournamentId: string) {
  const { data, error } = await sb
    .from("tournament_registrations")
    .select("position")
    .eq("tournament_id", tournamentId)
    .eq("is_reserve", false)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data?.position ?? 0) + 1;
}

/**
 * PATCH: sposta manualmente tra principale/riserva (admin)
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ regId: string }> }) {
  const denied = await guardAdmin(req);
if (denied) return denied;


  const { regId } = await ctx.params;
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  const targetReserve = Boolean(body.is_reserve);

  const { data: current, error: cerr } = await sb
    .from("tournament_registrations")
    .select("id,tournament_id,is_reserve")
    .eq("id", regId)
    .single();

  if (cerr || !current) {
    return NextResponse.json({ error: cerr?.message ?? "Not found" }, { status: 404 });
  }

  const tournamentId = current.tournament_id;
  const fromReserve = Boolean(current.is_reserve);

  if (fromReserve === targetReserve) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  let newPosition = 1;
  if (!targetReserve) {
    // promozione -> coda main
    newPosition = await getNextMainPosition(sb, tournamentId);
  } else {
    // retrocessione -> coda reserve
    const { data: last, error: lerr } = await sb
      .from("tournament_registrations")
      .select("position")
      .eq("tournament_id", tournamentId)
      .eq("is_reserve", true)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lerr) return NextResponse.json({ error: lerr.message }, { status: 500 });
    newPosition = (last?.position ?? 0) + 1;
  }

  const { error: uerr } = await sb
    .from("tournament_registrations")
    .update({ is_reserve: targetReserve, position: newPosition })
    .eq("id", regId);

  if (uerr) return NextResponse.json({ error: uerr.message }, { status: 500 });

  // ricompatta entrambe le liste
  try {
    await recompact(sb, tournamentId, false);
    await recompact(sb, tournamentId, true);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore ricompattamento" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

/**
 * ✅ DELETE: elimina iscrizione e, se era in MAIN, promuove automaticamente la prima riserva.
 * - Se torneo = Baraonda && categoria = Misto -> promuove prima riserva dello stesso sesso del cancellato
 * - Altrimenti -> promuove prima riserva (position più bassa)
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ regId: string }> }) {
  const denied = await guardAdmin(req);
if (denied) return denied;


  const { regId } = await ctx.params;
  const sb = supabaseAdmin();

  // carico la reg (per sapere torneo, reserve, gender)
  const { data: reg, error: rerr } = await sb
    .from("tournament_registrations")
    .select("id,tournament_id,is_reserve,p1_gender")
    .eq("id", regId)
    .single();

  if (rerr || !reg) return NextResponse.json({ error: rerr?.message ?? "Not found" }, { status: 404 });

  const tournamentId = reg.tournament_id;
  const wasReserve = Boolean(reg.is_reserve);
  const deletedGender = reg.p1_gender ? String(reg.p1_gender) : null;

  // elimina
  const { error: derr } = await sb.from("tournament_registrations").delete().eq("id", regId);
  if (derr) return NextResponse.json({ error: derr.message }, { status: 500 });

  // ricompatta la lista da cui abbiamo eliminato
  try {
    await recompact(sb, tournamentId, wasReserve);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore ricompattamento" }, { status: 500 });
  }

  // Se era main, prova auto-promozione
  if (!wasReserve) {
    // recupera info torneo
    const { data: t, error: terr } = await sb
      .from("tournaments")
      .select("id,type,category")
      .eq("id", tournamentId)
      .single();

    if (terr || !t) {
      // se non trovi torneo, non blocchiamo (la delete è fatta)
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const tournamentType = String((t as any).type);
    const tournamentCategory = String((t as any).category);

    const genderFilter =
      tournamentType === "Baraonda" && tournamentCategory === "Misto" && deletedGender && ["M", "F"].includes(deletedGender)
        ? deletedGender
        : null;

    // prima riserva (eventualmente filtrata per gender)
    let q = sb
      .from("tournament_registrations")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("is_reserve", true)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1);

    if (genderFilter) q = q.eq("p1_gender", genderFilter);

    const { data: nextReserve, error: nerr } = await q.maybeSingle();
    if (nerr) return NextResponse.json({ error: nerr.message }, { status: 500 });

    if (nextReserve?.id) {
      try {
        const nextPos = await getNextMainPosition(sb, tournamentId);

        const { error: perr } = await sb
          .from("tournament_registrations")
          .update({ is_reserve: false, position: nextPos })
          .eq("id", nextReserve.id);

        if (perr) return NextResponse.json({ error: perr.message }, { status: 500 });

        // ricompatta entrambe le liste dopo promozione
        await recompact(sb, tournamentId, false);
        await recompact(sb, tournamentId, true);
      } catch (e: any) {
        return NextResponse.json({ error: e?.message ?? "Errore promozione riserva" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
