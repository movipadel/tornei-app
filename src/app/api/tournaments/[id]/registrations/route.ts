import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendAdminPushNotification } from "@/lib/adminPush";

export const runtime = "nodejs";

const normalizePhone = (s: string) =>
  String(s ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[().-]/g, "");

const buildPlayerKey = (phone: string) =>
  normalizePhone(phone)
    .replace(/^(\+39|0039)/, "")
    .replace(/[^\d]/g, "");

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  // torneo
  const { data: t, error: terr } = await sb
    .from("tournaments")
    .select("id,type,category,level,max_participants,registrations_open,circuit_id")
    .eq("id", id)
    .single();

  if (terr || !t) {
    return NextResponse.json({ error: terr?.message ?? "Torneo non trovato" }, { status: 404 });
  }

  if ((t as any).registrations_open === false) {
    return NextResponse.json({ error: "Iscrizioni chiuse" }, { status: 403 });
  }

  const tournamentType = String((t as any).type);
  const tournamentCategory = String((t as any).category);
  const tournamentLevel = String((t as any).level ?? "").toLowerCase();
  const circuitId = (t as any).circuit_id ?? null;
  const max = Number((t as any).max_participants);

  let circuitRankingGroupId: string | null = null;

  if (circuitId) {
    const { data: group, error: gerr } = await sb
      .from("circuit_ranking_groups")
      .select("id")
      .eq("circuit_id", circuitId)
      .eq("category", tournamentCategory)
      .eq("level", tournamentLevel)
      .maybeSingle();

    if (gerr) {
      return NextResponse.json({ error: gerr.message }, { status: 500 });
    }

    if (!group) {
      return NextResponse.json(
        { error: "Nessun gruppo ranking per questo torneo nel circuito" },
        { status: 400 }
      );
    }

    circuitRankingGroupId = group.id;
  }

  // utente
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
  } else if (tournamentType === "Baraonda") {
    if (p2_name_raw || p2_phone_raw) {
      return NextResponse.json({ error: "Per Baraonda non inserire il secondo giocatore" }, { status: 400 });
    }
  }

// ==========================
// 🎯 CIRCUITO: telefoni univoci
// ==========================
let p1PlayerKey: string | null = null;
let p2PlayerKey: string | null = null;

if (circuitId) {
  p1PlayerKey = buildPlayerKey(p1_phone);

  if (!p1PlayerKey) {
    return NextResponse.json(
      { error: "Telefono giocatore 1 non valido per circuito" },
      { status: 400 }
    );
  }

  if (tournamentType === "Coppie fisse") {
    p2PlayerKey = buildPlayerKey(p2_phone_raw);

    if (!p2PlayerKey) {
      return NextResponse.json(
        { error: "Telefono giocatore 2 obbligatorio per i tornei circuito" },
        { status: 400 }
      );
    }

    if (p1PlayerKey === p2PlayerKey) {
      return NextResponse.json(
        { error: "I due giocatori non possono avere lo stesso numero di telefono" },
        { status: 400 }
      );
    }
  }

  const { data: existingRegs, error: existingErr } = await sb
    .from("tournament_registrations")
    .select("p1_name,p1_phone,p2_name,p2_phone")
    .eq("tournament_id", id);

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  const usedPhones = new Map<string, string>();

  for (const r of existingRegs ?? []) {
    const r1Key = buildPlayerKey(String((r as any).p1_phone ?? ""));
    const r2Key = buildPlayerKey(String((r as any).p2_phone ?? ""));

    if (r1Key) usedPhones.set(r1Key, String((r as any).p1_name ?? "Giocatore"));
    if (r2Key) usedPhones.set(r2Key, String((r as any).p2_name ?? "Giocatore"));
  }

  const duplicateP1 = usedPhones.get(p1PlayerKey);
  const duplicateP2 = p2PlayerKey ? usedPhones.get(p2PlayerKey) : null;

  if (duplicateP1) {
    return NextResponse.json(
      { error: `Numero giocatore 1 già presente nel torneo: ${duplicateP1}` },
      { status: 400 }
    );
  }

  if (duplicateP2) {
    return NextResponse.json(
      { error: `Numero giocatore 2 già presente nel torneo: ${duplicateP2}` },
      { status: 400 }
    );
  }
}

  // ==========================
  // resto codice IDENTICO
  // ==========================

  let is_reserve = false;

  const isMixedBaraonda =
    tournamentType === "Baraonda" &&
    String(tournamentCategory).toLowerCase() === "misto";

  if (isMixedBaraonda) {
    const maxPerSex = Math.floor(max / 2);
    const targetGender = String(p1_gender ?? "");

    const { data: mainRegs } = await sb
      .from("tournament_registrations")
      .select("p1_gender")
      .eq("tournament_id", id)
      .eq("is_reserve", false);

    const mainGenderCount = (mainRegs ?? []).filter(
      (r: any) => String(r.p1_gender ?? "") === targetGender
    ).length;

    is_reserve = mainGenderCount >= maxPerSex;
  } else {
    const { count: mainCount } = await sb
      .from("tournament_registrations")
      .select("*", { count: "exact", head: true })
      .eq("tournament_id", id)
      .eq("is_reserve", false);

    is_reserve = (mainCount ?? 0) >= max;
  }

  const { data: lastPos } = await sb
    .from("tournament_registrations")
    .select("position")
    .eq("tournament_id", id)
    .eq("is_reserve", is_reserve)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

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

  if (user?.id) payload.user_id = user.id;

    const { data, error } = await sb
    .from("tournament_registrations")
    .insert(payload)
    .select("id,is_reserve,position")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Telegram best-effort: non deve mai bloccare l'iscrizione
  try {
    const textRegistration =
      `${data.is_reserve ? "⏳ NUOVA RISERVA" : "✅ NUOVA ISCRIZIONE"}\n\n` +
      `${tournamentType}${tournamentCategory ? ` · ${tournamentCategory}` : ""}${tournamentLevel ? ` · ${tournamentLevel}` : ""}\n` +
      `👤 ${
        tournamentType === "Coppie fisse"
          ? `${p1_name}${p2_name_raw ? ` + ${p2_name_raw}` : ""}`
          : p1_name
      }\n` +
      `📞 ${p1_phone}\n` +
      `#️⃣ Posizione ${data.position}`;

    await sendTelegramMessage(textRegistration);
  } catch (e) {
    console.warn("Telegram registration notify error (ignored):", e);
  }
    // Push admin best-effort: non deve mai bloccare l'iscrizione
  try {
    await sendAdminPushNotification({
      title: data.is_reserve ? "⏳ Nuova riserva torneo" : "✅ Nuova iscrizione torneo",
      body:
        tournamentType === "Coppie fisse"
          ? `${p1_name}${p2_name_raw ? ` + ${p2_name_raw}` : ""} · ${tournamentCategory}`
          : `${p1_name} · ${tournamentCategory}`,
      url: "/admin/tournaments",
    });
  } catch (e) {
    console.warn("Admin push registration notify error (ignored):", e);
  }

  return NextResponse.json({ data }, { status: 201 });
}