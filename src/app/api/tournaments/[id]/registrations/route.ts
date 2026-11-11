import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";
import { sendTelegramMessage } from "@/lib/telegram";
import { enqueueStaffPushEvent } from "@/lib/staffPush";
import { measureNotificationRequest, schedulePostCommitNotifications } from "@/lib/postCommitNotifications";

export const runtime = "nodejs";

type RegistrationResult = {
  id: string;
  is_reserve: boolean;
  position: number;
  p1_name: string;
  p1_phone: string;
  p2_name: string | null;
};

const clientErrors: Record<string, [number, string]> = {
  TOURNAMENT_NOT_FOUND: [404, "Torneo non trovato"],
  REGISTRATIONS_CLOSED: [403, "Iscrizioni chiuse"],
  CIRCUIT_RANKING_GROUP_REQUIRED: [400, "Nessun gruppo ranking per questo torneo nel circuito"],
  ACTIVE_ACCOUNT_REQUIRED: [403, "Profilo MOVI non disponibile"],
  ACTIVE_CANONICAL_PLAYER_REQUIRED: [409, "Identità giocatore non disponibile"],
  PLAYER1_GENDER_CONFLICT: [409, "I dati del tuo profilo richiedono una verifica Admin"],
  COMPANION_SELECTION_INVALID: [400, "Seleziona nuovamente il secondo giocatore"],
  COMPANION_ACCOUNT_INACTIVE: [409, "Il secondo giocatore richiede una verifica Admin"],
  COMPANION_GENDER_CONFLICT: [409, "Il secondo giocatore richiede una verifica Admin"],
  COMPANION_NAME_PHONE_REQUIRED: [400, "Nome e telefono del secondo giocatore obbligatori"],
  COMPANION_GENDER_INVALID: [400, "Sesso del secondo giocatore non valido"],
  COMPANION_NOT_ALLOWED: [400, "Per Baraonda non inserire il secondo giocatore"],
  MIXED_GENDER_REQUIRED: [400, "Per il torneo Misto serve indicare il sesso di entrambi i giocatori"],
  CATEGORY_GENDER_MISMATCH: [403, "Categoria non compatibile con il profilo"],
  CIRCUIT_PHONE_REQUIRED: [400, "Telefono obbligatorio per i tornei circuito"],
  SAME_PHONE_TWICE: [400, "I due giocatori non possono avere lo stesso numero di telefono"],
  PLAYER_ALREADY_REGISTERED: [400, "Giocatore già presente nel torneo"],
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return measureNotificationRequest("/api/tournaments/[id]/registrations", () => handlePost(req, ctx));
}

async function handlePost(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getUserIdFromCookie();
  if (!uid) return NextResponse.json({ error: "Accedi per iscriverti" }, { status: 401 });
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const { data: t, error: terr } = await sb.from("tournaments")
    .select("id,type,category,level,registrations_open,circuit_id,circuit_ranking_group_id")
    .eq("id", id).single();
  if (terr || !t) return NextResponse.json({ error: "Torneo non trovato" }, { status: 404 });
  if (!t.registrations_open) return NextResponse.json({ error: "Iscrizioni chiuse" }, { status: 403 });

  // Keep the existing ranking-destination precheck; the RPC repeats it under a row lock.
  if (t.circuit_id) {
    let groupQuery = sb.from("circuit_ranking_groups").select("id")
      .eq("circuit_id", t.circuit_id).eq("level", String(t.level ?? "").toLowerCase());
    groupQuery = t.circuit_ranking_group_id
      ? groupQuery.eq("id", t.circuit_ranking_group_id)
      : groupQuery.eq("category", t.category);
    const { data: group, error } = await groupQuery.maybeSingle();
    if (error) return NextResponse.json({ error: "Impossibile verificare il gruppo ranking" }, { status: 500 });
    if (!group) return NextResponse.json({ error: "Nessun gruppo ranking per questo torneo nel circuito" }, { status: 400 });
  }

  const companionId = typeof body.p2_player_identity_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.p2_player_identity_id)
    ? body.p2_player_identity_id : null;
  if (body.p2_player_identity_id && !companionId) {
    return NextResponse.json({ error: "Seleziona nuovamente il secondo giocatore" }, { status: 400 });
  }
  const { data, error } = await sb.rpc("public_tournament_register_self", {
    p_user: uid,
    p_tournament: id,
    p_companion_identity: companionId,
    p_companion_name: companionId ? null : (typeof body.p2_name === "string" ? body.p2_name : null),
    p_companion_phone: companionId ? null : (typeof body.p2_phone === "string" ? body.p2_phone : null),
    p_companion_gender: companionId ? null : (body.p2_gender === "M" || body.p2_gender === "F" ? body.p2_gender : null),
  });
  if (error) {
    const code = Object.keys(clientErrors).find((key) => error.message.includes(key));
    if (code) {
      const [status, message] = clientErrors[code];
      return NextResponse.json({ error: message }, { status });
    }
    console.error("Public tournament registration failed", { code: error.code });
    return NextResponse.json({ error: "Impossibile completare l'iscrizione" }, { status: 500 });
  }
  if ((data as { state?: string } | null)?.state === "review") {
    return NextResponse.json({ error: "La tua identità giocatore richiede una verifica Admin prima dell'iscrizione" }, { status: 409 });
  }
  const result = data as RegistrationResult;
  const registrationText = `${result.is_reserve ? "⏳ NUOVA RISERVA" : "✅ NUOVA ISCRIZIONE"}\n\n` +
    `${t.type}${t.category ? ` · ${t.category}` : ""}${t.level ? ` · ${t.level}` : ""}\n` +
    `👤 ${result.p1_name}${result.p2_name ? ` + ${result.p2_name}` : ""}\n` +
    `📞 ${result.p1_phone}\n#️⃣ Posizione ${result.position}`;
  schedulePostCommitNotifications("/api/tournaments/[id]/registrations", [
    { provider: "telegram", run: () => sendTelegramMessage(registrationText), failureLog: "Telegram registration notify error (ignored):" },
    { provider: "push", run: () => enqueueStaffPushEvent(result.is_reserve ? "tournament.reserve.created" : "tournament.registration.created", result.id), failureLog: "Admin push registration notify error (ignored):" },
  ]);
  return NextResponse.json({ data: { id: result.id, is_reserve: result.is_reserve, position: result.position } }, { status: 201 });
}
