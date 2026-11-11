import { NextResponse } from "next/server";
import { getCurrentOperator, guardOperatorPermission } from "@/lib/operatorAuthorization";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const messages: Record<string, string> = {
  TOURNAMENT_PERMISSION_REQUIRED: "Permesso Tornei richiesto.",
  TOURNAMENT_NOT_FOUND: "Torneo non trovato.",
  TOURNAMENT_CATEGORY_FROZEN: "La tappa non è modificabile dopo la creazione della run o dei risultati.",
  GENDER_CONFIRMATION_REQUIRED: "Conferma un genere valido per l'iscrizione.",
  REGISTRATION_SLOT_INVALID: "Giocatore dell'iscrizione non valido.",
  CATEGORY_CONFIRMATION_REQUIRED: "Conferma la modifica della categoria.",
  CATEGORY_CONVERSION_INVALID: "Conversione della categoria non consentita.",
  SOLO_BARAONDA: "Questa azione è disponibile solo per Baraonda.",
  RUN_GIA_CREATA: "La run è già stata creata.",
  TAPPA_GIA_CONCLUSA: "La tappa è già chiusa o ha risultati assegnati.",
  CIRCUITO_RICHIESTO: "Associa prima la tappa a un circuito.",
  CLASSIFICA_ESPPLICITA_RICHIESTA: "Seleziona la classifica di destinazione.",
  NUMERO_GIOCATORI_NON_PARi: "Serve un numero pari di almeno quattro giocatori.",
  GENERE_NON_INDICATO: "Completa il genere di tutti i giocatori.",
  GENERI_NON_BILANCIATI: "Il numero di uomini e donne deve essere uguale.",
  CLASSIFICA_NON_VALIDA: "La classifica non appartiene a questo circuito o livello.",
};

async function invoke(id: string, body: Record<string, unknown>) {
  const denied = await guardOperatorPermission("tournaments.manage");
  if (denied) return denied;
  const operator = await getCurrentOperator();
  if (!operator) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  if (!uuid.test(id)) return NextResponse.json({ error: "Torneo non valido." }, { status: 400 });
  const action = String(body.action ?? "");
  if (!["eligibility", "set_gender", "convert_misto", "convert_libero"].includes(action)) {
    return NextResponse.json({ error: "Azione non valida." }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin().rpc("admin_tournament_prepare_mixed", {
    p_actor: operator.sid,
    p_tournament: id,
    p_action: action,
    p_registration: typeof body.registration_id === "string" ? body.registration_id : null,
    p_slot: typeof body.slot === "string" ? body.slot : null,
    p_gender: typeof body.gender === "string" ? body.gender : null,
    p_confirm: body.confirm === true,
  });
  if (error) {
    const message = messages[error.message];
    const status = error.message === "TOURNAMENT_NOT_FOUND" ? 404 : message ? 409 : 500;
    return NextResponse.json({ error: message ?? "Preparazione tappa non riuscita.", code: message ? error.message : undefined }, { status });
  }
  return NextResponse.json({ data });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return invoke(id, { action: "eligibility" });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const raw = await request.text();
  if (raw.length > 1024) return NextResponse.json({ error: "Richiesta troppo grande." }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Dati non validi." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Dati non validi." }, { status: 400 });
  }
  return invoke(id, body as Record<string, unknown>);
}
