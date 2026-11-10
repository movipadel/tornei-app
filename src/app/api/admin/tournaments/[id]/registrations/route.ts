import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardOperatorPermission, getCurrentOperator } from "@/lib/operatorAuthorization";
import { sendTelegramMessage } from "@/lib/telegram";
import { enqueueStaffPushEvent } from "@/lib/staffPush";
import { schedulePostCommitNotifications } from "@/lib/postCommitNotifications";
import { registrationAccountStatus } from "@/lib/tournamentRegistrationAccountStatus";

export const runtime = "nodejs";

const expectedErrors = new Set([
  "TOURNAMENT_NOT_FOUND", "REGISTRATIONS_CLOSED", "CIRCUIT_RANKING_GROUP_REQUIRED",
  "PLAYER_SELECTION_REQUIRED", "ACTIVE_CANONICAL_PLAYER_REQUIRED", "ACTIVE_ACCOUNT_REQUIRED",
  "ACCOUNT_RESOLUTION_CONFIRMATION_REQUIRED", "ACCOUNT_IDENTITY_REVIEW_REQUIRED",
  "NEW_PLAYER_CONFIRMATION_REQUIRED", "NAME_PHONE_REQUIRED", "GENDER_INVALID", "GENDER_CONFLICT",
  "EXISTING_PLAYER_OR_ACCOUNT_SELECT_REQUIRED", "POSSIBLE_PLAYER_CONFLICT_CONFIRMATION_REQUIRED",
  "SAME_PLAYER_TWICE", "PLAYER_ALREADY_REGISTERED", "SAME_PHONE_TWICE",
  "MIXED_GENDER_REQUIRED", "CATEGORY_GENDER_MISMATCH",
]);
const errorMessages: Record<string, string> = {
  ACCOUNT_IDENTITY_REVIEW_REQUIRED: "Identità dell’account da verificare nel Customer Hub prima dell’iscrizione.",
  EXISTING_PLAYER_OR_ACCOUNT_SELECT_REQUIRED: "Esiste già un giocatore o account con questo telefono: selezionalo dalla ricerca.",
  POSSIBLE_PLAYER_CONFLICT_CONFIRMATION_REQUIRED: "Possibile omonimo o alias storico: verifica e conferma prima di creare.",
  PLAYER_ALREADY_REGISTERED: "Giocatore già presente tra iscritti o riserve del torneo.",
  SAME_PLAYER_TWICE: "Seleziona due identità giocatore diverse.",
  GENDER_CONFLICT: "Il sesso selezionato non coincide con l’identità sportiva.",
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardOperatorPermission("tournaments.manage");
  if (denied) return denied;
  const operator = await getCurrentOperator();
  if (!operator) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data, error } = await db.rpc("admin_tournament_register_players", {
    p_actor: operator.sid, p_tournament: id, p_data: body,
  });
  if (error) {
    const code = expectedErrors.has(error.message) ? error.message : "REGISTRATION_FAILED";
    if (code === "REGISTRATION_FAILED") console.error("Admin tournament registration failed", error.code);
    return NextResponse.json({ error: errorMessages[code] ?? code }, { status: code === "REGISTRATION_FAILED" ? 500 : 400 });
  }
  const [registration, tournament] = await Promise.all([
    db.from("tournament_registrations").select("p1_name,p1_phone,p2_name").eq("id", data.id).maybeSingle(),
    db.from("tournaments").select("type,category,level").eq("id", id).maybeSingle(),
  ]);
  if (registration.error || tournament.error) {
    console.error("Admin tournament notification context unavailable", { registration: registration.error?.code, tournament: tournament.error?.code });
  }
  const row = registration.data;
  const t = tournament.data;
  const textRegistration = row && t ?
    `${data.is_reserve ? "⏳ NUOVA RISERVA" : "✅ NUOVA ISCRIZIONE"}\n\n` +
    `${t.type}${t.category ? ` · ${t.category}` : ""}${t.level ? ` · ${String(t.level).toLowerCase()}` : ""}\n` +
    `👤 ${t.type === "Coppie fisse" ? `${row.p1_name}${row.p2_name ? ` + ${row.p2_name}` : ""}` : row.p1_name}\n` +
    `📞 ${row.p1_phone}\n#️⃣ Posizione ${data.position}` : null;
  schedulePostCommitNotifications("/api/admin/tournaments/[id]/registrations", [
    ...(textRegistration ? [{ provider: "telegram" as const, run: () => sendTelegramMessage(textRegistration), failureLog: "Telegram registration notify error (ignored):" }] : []),
    { provider: "push", run: () => enqueueStaffPushEvent(data.is_reserve ? "tournament.reserve.created" : "tournament.registration.created", data.id), failureLog: "Admin push registration notify error (ignored):" },
  ]);
  return NextResponse.json({ data }, { status: 201 });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardOperatorPermission("tournaments.manage");
  if (denied) return denied;


  const { id } = await ctx.params;
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("tournament_registrations")
    .select("id,tournament_id,position,is_reserve,p1_name,p1_phone,p1_gender,p2_name,p2_phone,p2_gender,notes,created_at,p1_player_identity_id,p2_player_identity_id")
    .eq("tournament_id", id)
    .order("is_reserve", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all = data ?? [];
  const identityIds = [...new Set(all.flatMap((row) => [row.p1_player_identity_id, row.p2_player_identity_id]).filter((value): value is string => Boolean(value)))];
  const identitiesResult = identityIds.length
    ? await sb.from("player_identities").select("id,status,merged_into_player_id,account_user_id").in("id", identityIds)
    : { data: [], error: null };
  if (identitiesResult.error) return NextResponse.json({ error: "Stato account non disponibile" }, { status: 500 });
  const identities = new Map((identitiesResult.data ?? []).map((identity) => [identity.id, identity]));
  const accountIds = [...new Set((identitiesResult.data ?? []).map((identity) => identity.account_user_id).filter((value): value is string => Boolean(value)))];
  const accountsResult = accountIds.length
    ? await sb.from("users").select("id,identity_status,merged_into_user_id").in("id", accountIds)
    : { data: [], error: null };
  if (accountsResult.error) return NextResponse.json({ error: "Stato account non disponibile" }, { status: 500 });
  const accounts = new Map((accountsResult.data ?? []).map((account) => [account.id, account]));
  const rows = all.map((row) => {
    const p1Identity = row.p1_player_identity_id ? identities.get(row.p1_player_identity_id) : undefined;
    const p2Identity = row.p2_player_identity_id ? identities.get(row.p2_player_identity_id) : undefined;
    return {
      ...row,
      p1_account_status: registrationAccountStatus(row.p1_player_identity_id, p1Identity, p1Identity?.account_user_id ? accounts.get(p1Identity.account_user_id) : undefined),
      p2_account_status: row.p2_name
        ? registrationAccountStatus(row.p2_player_identity_id, p2Identity, p2Identity?.account_user_id ? accounts.get(p2Identity.account_user_id) : undefined)
        : null,
    };
  });
  return NextResponse.json({
    main: rows.filter((row) => !row.is_reserve),
    reserve: rows.filter((row) => row.is_reserve),
  });
}

/**
 * ✅ Elimina TUTTE le iscrizioni del torneo (principale + riserva)
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardOperatorPermission("tournaments.manage");
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
