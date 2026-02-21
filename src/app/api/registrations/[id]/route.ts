import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";

const normalizePhone = (s: string) =>
  String(s ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[().-]/g, "");

function phoneMatches(input: string, stored: string) {
  const a = normalizePhone(input);
  const b = normalizePhone(stored);
  if (!a || !b) return false;
  // Base44 style: match anche parziale
  return a.includes(b) || b.includes(a);
}

function fmtPrettyDate(dateStr?: string | null) {
  const s = String(dateStr ?? "");
  if (!s) return "";
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function fmtWho(reg: any, tType: string) {
  const p1 = String(reg?.p1_name ?? "").trim();
  const p2 = String(reg?.p2_name ?? "").trim();
  if (tType === "Coppie fisse") return `${p1}${p2 ? ` + ${p2}` : ""}`;
  return p1;
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();

  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body.phone ?? ""));

  if (!phone) {
    return NextResponse.json({ error: "Telefono obbligatorio" }, { status: 400 });
  }

  // 1) carico record completo (serve tournament_id + pos + nomi)
  const { data: reg, error: rerr } = await sb
    .from("tournament_registrations")
    .select("id,tournament_id,is_reserve,position,p1_name,p2_name,p1_phone,p2_phone,p1_gender,p2_gender")
    .eq("id", id)
    .single();

  if (rerr || !reg) {
    return NextResponse.json({ error: rerr?.message ?? "Iscrizione non trovata" }, { status: 404 });
  }

  // 2) verifico autorizzazione via telefono
  const ok =
    phoneMatches(phone, String((reg as any).p1_phone ?? "")) ||
    ((reg as any).p2_phone ? phoneMatches(phone, String((reg as any).p2_phone)) : false);

  if (!ok) {
    return NextResponse.json({ error: "Telefono non autorizzato" }, { status: 403 });
  }

  const tournamentId = String((reg as any).tournament_id);
  const deletedWasReserve = Boolean((reg as any).is_reserve);
  const deletedPos = Number((reg as any).position ?? 0);

  // info torneo (per telegram + max)
  const { data: tInfo } = await sb
    .from("tournaments")
    .select("id,name,type,category,date,time,location,max_participants")
    .eq("id", tournamentId)
    .maybeSingle();

  const tName = String((tInfo as any)?.name ?? "Torneo");
  const tType = String((tInfo as any)?.type ?? "");
  const tCat = String((tInfo as any)?.category ?? "");
  const tDate = String((tInfo as any)?.date ?? "");
  const tTime = String((tInfo as any)?.time ?? "");
  const tLoc = String((tInfo as any)?.location ?? "");
  const tMax = Number((tInfo as any)?.max_participants ?? 0);

  const whoDeleted = fmtWho(reg, tType);

  // 3) cancello
  const { error: derr } = await sb.from("tournament_registrations").delete().eq("id", id);
  if (derr) {
    return NextResponse.json({ error: derr.message }, { status: 500 });
  }


  // Supabase JS non supporta "position = position - 1" diretto senza RPC.
  // Quindi facciamo una soluzione semplice e robusta: rileggo e rinumero.
  // (Per i vostri volumi è perfetta e zero bug.)

  async function renumberPositions() {
    const { data: regsAll, error } = await sb
      .from("tournament_registrations")
      .select("id,is_reserve,position")
      .eq("tournament_id", tournamentId)
      .order("is_reserve", { ascending: true })
      .order("position", { ascending: true });

    if (error) throw error;

    const main = (regsAll ?? []).filter((r: any) => !r.is_reserve);
    const reserve = (regsAll ?? []).filter((r: any) => !!r.is_reserve);

    // rinumero main 1..n
    for (let i = 0; i < main.length; i++) {
      const row = main[i] as any;
      const want = i + 1;
      if (Number(row.position ?? 0) !== want) {
        await sb.from("tournament_registrations").update({ position: want }).eq("id", row.id);
      }
    }

    // rinumero riserva 1..m
    for (let i = 0; i < reserve.length; i++) {
      const row = reserve[i] as any;
      const want = i + 1;
      if (Number(row.position ?? 0) !== want) {
        await sb.from("tournament_registrations").update({ position: want }).eq("id", row.id);
      }
    }
  }

  // 5) PROMOZIONE: solo se ho cancellato un MAIN
  let promoted: any = null;

  if (!deletedWasReserve) {
    // prendo prima riserva (position più bassa)
    const { data: firstReserve, error: ferr } = await sb
      .from("tournament_registrations")
      .select("id,p1_name,p2_name,p1_gender,p2_gender")
      .eq("tournament_id", tournamentId)
      .eq("is_reserve", true)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (ferr) {
      // non blocchiamo cancellazione, ma logghiamo
      console.warn("reserve fetch error:", ferr);
    }

    if (firstReserve?.id) {
      // diventa MAIN
      const { error: uerr } = await sb
        .from("tournament_registrations")
        .update({ is_reserve: false })
        .eq("id", String(firstReserve.id));

      if (!uerr) promoted = firstReserve;
    }
  }

  // 6) rinumero SEMPRE dopo la promozione (robusto e semplice)
  try {
    await renumberPositions();
  } catch (e) {
    console.warn("renumberPositions error (ignored):", e);
  }

  // 7) TELEGRAM: cancellazione + (eventuale) promozione (non bloccante)
  try {
    // conteggi aggiornati
    const { data: regsNow } = await sb
      .from("tournament_registrations")
      .select("is_reserve,p1_gender,p2_gender")
      .eq("tournament_id", tournamentId);

    const isMixedBaraonda = tType === "Baraonda" && String(tCat).toLowerCase() === "misto";
    const counts = { main: 0, reserve: 0, male: 0, female: 0 };

    for (const r of regsNow ?? []) {
      if ((r as any).is_reserve) counts.reserve += 1;
      else {
        counts.main += 1;
        const g1 = (r as any).p1_gender;
        const g2 = (r as any).p2_gender;
        if (g1 === "M") counts.male += 1;
        if (g1 === "F") counts.female += 1;
        if (g2 === "M") counts.male += 1;
        if (g2 === "F") counts.female += 1;
      }
    }

    const lineMain = `👥 ${counts.main}/${tMax}`;
    const lineReserve = counts.reserve > 0 ? `  ⏳ ${counts.reserve}` : "";
    const lineGender = isMixedBaraonda ? `  ♂ ${counts.male}  ♀ ${counts.female}` : "";

    const header =
      `🏆 ${tName}\n` +
      `${tType}${tCat ? ` · ${tCat}` : ""}\n` +
      `${fmtPrettyDate(tDate)}${tTime ? ` · ${tTime}` : ""}\n` +
      `${tLoc ? `📍 ${tLoc}\n` : ""}`;

    // 7a) Cancellazione
    const textCancel =
      `❌ CANCELLAZIONE ISCRIZIONE\n\n` +
      header +
      `\n👤 ${whoDeleted}\n\n` +
      `📊 Situazione\n` +
      `${lineMain}${lineReserve}${lineGender}`;

    await sendTelegramMessage(textCancel);

    // 7b) Promozione
    if (promoted?.id) {
      const whoPromoted = fmtWho(promoted, tType);
      const textPromo =
        `⬆️ PROMOZIONE DA RISERVA\n\n` +
        header +
        `\n👤 ${whoPromoted}\n✅ ora in MAIN\n\n` +
        `📊 Situazione\n` +
        `${lineMain}${lineReserve}${lineGender}`;

      await sendTelegramMessage(textPromo);
    }
  } catch (e) {
    console.warn("Telegram notify error (ignored):", e);
  }

  return NextResponse.json({ ok: true, promoted: Boolean(promoted?.id) });
}