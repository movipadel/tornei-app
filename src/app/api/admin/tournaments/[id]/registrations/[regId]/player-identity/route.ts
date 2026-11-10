import { NextResponse } from "next/server";
import { guardOperatorPermission, getCurrentOperator } from "@/lib/operatorAuthorization";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const knownErrors: Record<string, { status: number; message: string }> = {
  TOURNAMENT_PERMISSION_REQUIRED: { status: 403, message: "Permesso Tornei richiesto." },
  LINK_CONFIRMATION_REQUIRED: { status: 400, message: "Conferma il collegamento del giocatore." },
  REGISTRATION_SLOT_INVALID: { status: 400, message: "Slot giocatore non valido." },
  PLAYER_SELECTION_REQUIRED: { status: 400, message: "Seleziona un giocatore o crea una nuova identità." },
  TOURNAMENT_NOT_FOUND: { status: 404, message: "Torneo non trovato." },
  REGISTRATION_NOT_FOUND: { status: 404, message: "Iscrizione non trovata." },
  REGISTRATION_CHANGED: { status: 409, message: "L’iscrizione è cambiata. Ricarica la lista e riprova." },
  REGISTRATION_ALREADY_LINKED: { status: 409, message: "Il giocatore è già collegato. Ricarica la lista." },
  CANDIDATE_CHANGED: { status: 409, message: "Il profilo selezionato è cambiato. Ripeti la ricerca." },
  ACTIVE_CANONICAL_PLAYER_REQUIRED: { status: 409, message: "L’identità selezionata non è più attiva o canonica." },
  ACTIVE_ACCOUNT_REQUIRED: { status: 409, message: "L’account selezionato non è più attivo." },
  ACCOUNT_IDENTITY_REVIEW_REQUIRED: { status: 409, message: "L’identità dell’account richiede una verifica nel Customer Hub." },
  NAME_PHONE_REQUIRED: { status: 400, message: "Inserisci nome e telefono validi." },
  GENDER_INVALID: { status: 400, message: "Sesso non valido." },
  GENDER_CONFLICT: { status: 409, message: "Il sesso del profilo non coincide con l’iscrizione." },
  EXISTING_PLAYER_OR_ACCOUNT_SELECT_REQUIRED: { status: 409, message: "Esiste già un giocatore o account con questo telefono: selezionalo dalla ricerca." },
  POSSIBLE_PLAYER_CONFLICT_CONFIRMATION_REQUIRED: { status: 409, message: "Verifica l’omonimo o alias storico e conferma prima di creare." },
  SAME_PLAYER_TWICE: { status: 409, message: "I due slot della coppia devono avere giocatori diversi." },
  PLAYER_ALREADY_REGISTERED: { status: 409, message: "Questo giocatore è già presente nel torneo o nelle riserve." },
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, context: { params: Promise<{ id: string; regId: string }> }) {
  const denied = await guardOperatorPermission("tournaments.manage");
  if (denied) return denied;
  const operator = await getCurrentOperator();
  if (!operator) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id, regId } = await context.params;
  if (!uuid.test(id) || !uuid.test(regId)) {
    return NextResponse.json({ error: "Identificativo non valido." }, { status: 400 });
  }
  const text = await request.text();
  if (text.length > 4096) return NextResponse.json({ error: "Richiesta troppo grande." }, { status: 413 });
  let data: unknown;
  try { data = JSON.parse(text); } catch { return NextResponse.json({ error: "Dati non validi." }, { status: 400 }); }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json({ error: "Dati non validi." }, { status: 400 });
  }
  const { data: result, error } = await supabaseAdmin().rpc("admin_tournament_link_registration_identity", {
    p_actor: operator.sid, p_tournament: id, p_registration: regId, p_data: data,
  });
  if (error) {
    const known = knownErrors[error.message];
    if (known) return NextResponse.json({ error: known.message, code: error.message }, { status: known.status });
    console.error("Historical tournament identity link failed", error.code);
    return NextResponse.json({ error: "Collegamento non riuscito." }, { status: 500 });
  }
  return NextResponse.json({ data: result });
}
