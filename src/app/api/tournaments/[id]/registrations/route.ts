import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";
import { sendTelegramMessage } from "@/lib/telegram";

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

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: terr?.message ?? "Torneo non trovato" }, { status: 404 });
  }

  const tournamentType = String((t as any).type); // "Baraonda" | "Coppie fisse"
  const tournamentCategory = String((t as any).category); // "Maschile" | "Femminile" | "Misto"
  const max = Number((t as any).max_participants);

  // utente loggato (opzionale)
  const uid = await getUserIdFromCookie();
  let user: any = null;

  if (uid) {
    const { data: u } = await sb.from("users").select("id,full_name,phone,email,gender").eq("id", uid).maybeSingle();
    user = u ?? null;
  }

  // regola sesso (solo se loggato)
  if (user?.gender) {
    if (tournamentCategory === "Femminile" && user.gender === "M") {
      return NextResponse.json({ error: "Torneo femminile: accesso non consentito" }, { status: 403 });
    }
    if (tournamentCategory === "Maschile" && user.gender === "F") {
      return NextResponse.json({ error: "Torneo maschile: accesso non consentito" }, { status: 403 });
    }
  }

  // payload
  const p1_name = String(body.p1_name ?? "").trim();
  const p1_phone = normalizePhone(body.p1_phone ?? "");
  const p1_gender = body.p1_gender ?? null;

  const p2_name_raw = String(body.p2_name ?? "").trim();
  const p2_phone_raw = body.p2_phone ? normalizePhone(body.p2_phone) : "";
  const p2_gender = body.p2_gender ?? null;

  if (!p1_name) return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
  if (!p1_phone) return NextResponse.json({ error: "Telefono obbligatorio" }, { status: 400 });

  // se Misto: consigliato avere sesso per Baraonda (per conteggi)
  if (tournamentType === "Baraonda" && tournamentCategory === "Misto") {
    if (!["M", "F"].includes(String(p1_gender))) {
      return NextResponse.json({ error: "Per torneo Misto seleziona il sesso (M/F)" }, { status: 400 });
    }
  }

  if (p1_gender && !["M", "F"].includes(String(p1_gender))) {
    return NextResponse.json({ error: "Sesso non valido (M/F)" }, { status: 400 });
  }
  if (p2_gender && !["M", "F"].includes(String(p2_gender))) {
    return NextResponse.json({ error: "Sesso giocatore 2 non valido (M/F)" }, { status: 400 });
  }

  if (tournamentType === "Coppie fisse") {
    if (!p2_name_raw) {
      return NextResponse.json({ error: "Nome giocatore 2 obbligatorio" }, { status: 400 });
    }
    // ✅ p2_phone NON obbligatorio
  } else if (tournamentType === "Baraonda") {
    if (p2_name_raw || p2_phone_raw) {
      return NextResponse.json({ error: "Per Baraonda non inserire il secondo giocatore" }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: `Tipo torneo non gestito: ${tournamentType}` }, { status: 400 });
  }

  // capienza main -> riserva
  const { count: mainCount, error: cerr } = await sb
    .from("tournament_registrations")
    .select("*", { count: "exact", head: true })
    .eq("tournament_id", id)
    .eq("is_reserve", false);

  if (cerr) return NextResponse.json({ error: cerr.message }, { status: 500 });

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

  if (perr) return NextResponse.json({ error: perr.message }, { status: 500 });

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
    p2_gender: tournamentType === "Coppie fisse" && p2_gender ? String(p2_gender) : null,
  };

  // se loggato: salva user_id
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

  // ==========================
  // ✅ TELEGRAM NOTIFY (non bloccante)
  // ==========================
  try {
    const { data: tInfo } = await sb
      .from("tournaments")
      .select("id,name,type,category,date,time,location,max_participants")
      .eq("id", id)
      .maybeSingle();

    const { data: regs } = await sb
      .from("tournament_registrations")
      .select("is_reserve,p1_gender,p2_gender")
      .eq("tournament_id", id);

    const counts = { main: 0, reserve: 0, male: 0, female: 0 };
    for (const r of regs ?? []) {
      if ((r as any).is_reserve) {
        counts.reserve += 1;
      } else {
        counts.main += 1;
        const g1 = (r as any).p1_gender;
        const g2 = (r as any).p2_gender;
        if (g1 === "M") counts.male += 1;
        if (g1 === "F") counts.female += 1;
        if (g2 === "M") counts.male += 1;
        if (g2 === "F") counts.female += 1;
      }
    }

    const tName = String((tInfo as any)?.name ?? "Torneo");
    const tType = String((tInfo as any)?.type ?? "");
    const tCat = String((tInfo as any)?.category ?? "");
    const tDate = String((tInfo as any)?.date ?? "");
    const tTime = String((tInfo as any)?.time ?? "");
    const tLoc = String((tInfo as any)?.location ?? "");
    const tMax = Number((tInfo as any)?.max_participants ?? 0);

    const isFixedPairs = tType === "Coppie fisse";
    const isMixedBaraonda = tType === "Baraonda" && String(tCat).toLowerCase() === "misto";

    const who = isFixedPairs ? `${p1_name} + ${p2_name_raw}` : p1_name;

    const lineMain = `👥 ${counts.main}/${tMax}`;
    const lineReserve = counts.reserve > 0 ? `  ⏳ ${counts.reserve}` : "";
    const lineGender = isMixedBaraonda ? `  ♂ ${counts.male}  ♀ ${counts.female}` : "";

    const wentToReserveBecauseFull = Boolean((data as any)?.is_reserve);
    const becameFullNow = !wentToReserveBecauseFull && tMax > 0 && counts.main >= tMax;

    const badge = wentToReserveBecauseFull ? "⏳ RISERVA" : "✅ MAIN";

    const extra = wentToReserveBecauseFull
      ? "\n\n⚠️ Torneo PIENO → inserito in RISERVA"
      : becameFullNow
      ? "\n\n🏁 Torneo ora PIENO (prossime iscrizioni in riserva)"
      : "";

    const text =
      `🎾 NUOVA ISCRIZIONE\n\n` +
      `🏆 ${tName}\n` +
      `${tType}${tCat ? ` · ${tCat}` : ""}\n` +
      `${tDate}${tTime ? ` · ${tTime}` : ""}\n` +
      `${tLoc ? `📍 ${tLoc}\n` : ""}\n` +
      `👤 ${who}\n` +
      `${badge}\n\n` +
      `📊 Situazione\n` +
      `${lineMain}${lineReserve}${lineGender}` +
      `${extra}`;

    await sendTelegramMessage(text);
  } catch (e) {
    console.warn("Telegram notify error (ignored):", e);
  }

  return NextResponse.json({ data }, { status: 201 });
}