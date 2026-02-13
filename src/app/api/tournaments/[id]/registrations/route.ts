import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";

export const runtime = "nodejs";

/**
 * Normalizza telefono:
 * - trim
 * - rimuove spazi
 * - rimuove caratteri comuni di formattazione
 * (mantiene + e numeri)
 */
const normalizePhone = (s: string) =>
  String(s ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[().-]/g, "");

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  // torneo
  const { data: t, error: terr } = await sb
    .from("tournaments")
    .select("id,type,category,max_participants")
    .eq("id", id)
    .single();

  if (terr || !t) {
    return NextResponse.json(
      { error: terr?.message ?? "Torneo non trovato" },
      { status: 404 }
    );
  }

  const tournamentType = String((t as any).type); // "Baraonda" | "Coppie fisse"
  const tournamentCategory = String((t as any).category); // "Maschile" | "Femminile" | "Misto"
  const max = Number((t as any).max_participants);

  // utente loggato (opzionale)
  const uid = await getUserIdFromCookie();
  let user: any = null;

  if (uid) {
    const { data: u } = await sb
      .from("users")
      .select("id,full_name,phone,email,gender")
      .eq("id", uid)
      .maybeSingle();
    user = u ?? null;
  }

  // regola sesso (solo se loggato)
  if (user?.gender) {
    if (tournamentCategory === "Femminile" && user.gender === "M") {
      return NextResponse.json(
        { error: "Torneo femminile: accesso non consentito" },
        { status: 403 }
      );
    }
    if (tournamentCategory === "Maschile" && user.gender === "F") {
      return NextResponse.json(
        { error: "Torneo maschile: accesso non consentito" },
        { status: 403 }
      );
    }
  }

  // payload
  const p1_name = String(body.p1_name ?? "").trim();
  const p1_phone = normalizePhone(body.p1_phone ?? "");
  const p1_gender = body.p1_gender ?? null;

  const p2_name_raw = String(body.p2_name ?? "").trim();
  const p2_phone_raw = body.p2_phone ? normalizePhone(body.p2_phone) : "";
  const p2_gender = body.p2_gender ?? null;

  if (!p1_name) {
    return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
  }
  if (!p1_phone) {
    return NextResponse.json(
      { error: "Telefono obbligatorio" },
      { status: 400 }
    );
  }

  // se Misto: consigliato avere sesso per Baraonda (per conteggi)
  if (tournamentType === "Baraonda" && tournamentCategory === "Misto") {
    if (!["M", "F"].includes(String(p1_gender))) {
      return NextResponse.json(
        { error: "Per torneo Misto seleziona il sesso (M/F)" },
        { status: 400 }
      );
    }
  }

  if (p1_gender && !["M", "F"].includes(String(p1_gender))) {
    return NextResponse.json(
      { error: "Sesso non valido (M/F)" },
      { status: 400 }
    );
  }
  if (p2_gender && !["M", "F"].includes(String(p2_gender))) {
    return NextResponse.json(
      { error: "Sesso giocatore 2 non valido (M/F)" },
      { status: 400 }
    );
  }

  if (tournamentType === "Coppie fisse") {
    if (!p2_name_raw) {
      return NextResponse.json(
        { error: "Nome giocatore 2 obbligatorio" },
        { status: 400 }
      );
    }
    // ✅ p2_phone NON obbligatorio (può non essere disponibile)
    // Se fornito, viene salvato normalizzato; altrimenti null.
  } else if (tournamentType === "Baraonda") {
    if (p2_name_raw || p2_phone_raw) {
      return NextResponse.json(
        { error: "Per Baraonda non inserire il secondo giocatore" },
        { status: 400 }
      );
    }
  } else {
    return NextResponse.json(
      { error: `Tipo torneo non gestito: ${tournamentType}` },
      { status: 400 }
    );
  }

  // ✅ Telefoni duplicati: consentiti
  // Motivo: può capitare che un giocatore non abbia il numero del compagno e inserisca il proprio anche su p2.
  // Quindi:
  // - p1_phone può essere uguale a p2_phone
  // - lo stesso numero può essere riutilizzato in più registrazioni dello stesso torneo

  // capienza main -> riserva
  const { count: mainCount, error: cerr } = await sb
    .from("tournament_registrations")
    .select("*", { count: "exact", head: true })
    .eq("tournament_id", id)
    .eq("is_reserve", false);

  if (cerr) {
    return NextResponse.json({ error: cerr.message }, { status: 500 });
  }

  const is_reserve = (mainCount ?? 0) >= max;

  // posizione in coda
  const { data: lastPos, error: perr } = await sb
    .from("tournament_registrations")
    .select("position")
    .eq("tournament_id", id)
    .eq("is_reserve", is_reserve)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (perr) {
    return NextResponse.json({ error: perr.message }, { status: 500 });
  }

  const position = (lastPos?.position ?? 0) + 1;

  const payload: any = {
    tournament_id: id,
    is_reserve,
    position,
    p1_name,
    p1_phone,
    p1_gender: p1_gender ? String(p1_gender) : null,
    p2_name: tournamentType === "Coppie fisse" ? p2_name_raw : null,
    p2_phone: tournamentType === "Coppie fisse" ? (p2_phone_raw || null) : null,
    p2_gender:
      tournamentType === "Coppie fisse" && p2_gender ? String(p2_gender) : null,
  };

  // se loggato: salva user_id (ora esiste in tabella)
  if (user?.id) payload.user_id = user.id;

  const { data, error } = await sb
    .from("tournament_registrations")
    .insert(payload)
    .select("id,is_reserve,position")
    .single();

  if (error) {
    console.error("registration insert error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
