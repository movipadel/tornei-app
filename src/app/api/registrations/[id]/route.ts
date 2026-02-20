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

  // stile Base44: match anche parziale (includes)
  return a.includes(b) || b.includes(a);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();

  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body.phone ?? ""));

  if (!phone) {
    return NextResponse.json({ error: "Telefono obbligatorio" }, { status: 400 });
  }

  // 1) carico record (mi servono più campi per TELEGRAM)
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

  // 3) cancello
  const { error: derr } = await sb.from("tournament_registrations").delete().eq("id", id);
  if (derr) {
    return NextResponse.json({ error: derr.message }, { status: 500 });
  }

  // 4) TELEGRAM (non bloccante)
  try {
    const tournamentId = String((reg as any).tournament_id ?? "");

    const { data: tInfo } = await sb
      .from("tournaments")
      .select("id,name,type,category,date,time,location,max_participants")
      .eq("id", tournamentId)
      .maybeSingle();

    // conteggi aggiornati dopo delete
    const { data: regs } = await sb
      .from("tournament_registrations")
      .select("is_reserve,p1_gender,p2_gender")
      .eq("tournament_id", tournamentId);

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

    const p1 = String((reg as any).p1_name ?? "").trim();
    const p2 = String((reg as any).p2_name ?? "").trim();
    const who = isFixedPairs ? `${p1}${p2 ? ` + ${p2}` : ""}` : p1;

    const wasReserve = Boolean((reg as any).is_reserve);
    const badge = wasReserve ? "⏳ ERA IN RISERVA" : "✅ ERA IN MAIN";

    const lineMain = `👥 ${counts.main}/${tMax}`;
    const lineReserve = counts.reserve > 0 ? `  ⏳ ${counts.reserve}` : "";
    const lineGender = isMixedBaraonda ? `  ♂ ${counts.male}  ♀ ${counts.female}` : "";

    const text =
      `🗑️ CANCELLAZIONE ISCRIZIONE\n\n` +
      `🏆 ${tName}\n` +
      `${tType}${tCat ? ` · ${tCat}` : ""}\n` +
      `${tDate}${tTime ? ` · ${tTime}` : ""}\n` +
      `${tLoc ? `📍 ${tLoc}\n` : ""}\n` +
      `👤 ${who}\n` +
      `${badge}\n\n` +
      `📊 Situazione\n` +
      `${lineMain}${lineReserve}${lineGender}`;

    await sendTelegramMessage(text);
  } catch (e) {
    console.warn("Telegram notify cancel error (ignored):", e);
  }

  return NextResponse.json({ ok: true });
}