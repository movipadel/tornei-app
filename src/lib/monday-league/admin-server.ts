import "server-only";
import { NextResponse } from "next/server";
import { getStaffSessionFromCookie } from "@/lib/staffSession";

export async function getMondayLeagueAdminActorId() {
  const session = await getStaffSessionFromCookie();
  if (!session || session.role !== "admin") return null;
  return session.sid;
}

const FRIENDLY_ERRORS: Record<string, string> = {
  ML_ADMIN_REQUIRED: "Accesso admin richiesto",
  ML_INVALID_SEASON: "Dati stagione non validi",
  ML_SEASON_NOT_EDITABLE: "La stagione non è modificabile",
  ML_PHASE1_NOT_EDITABLE: "La Fase 1 non è più modificabile",
  ML_INVALID_TEAM_PAYLOAD: "Dati squadra non validi",
  ML_ROSTER_SIZE_INVALID: "La rosa deve contenere da 1 a 4 giocatori",
  ML_DUPLICATE_LINKED_USER: "Lo stesso utente non può comparire due volte nella rosa",
  ML_CAPTAIN_MUST_BE_LINKED_ROSTER_USER: "Il capitano deve essere un utente registrato presente nella rosa",
  ML_MAX_ACTIVE_TEAMS: "Sono già presenti 16 squadre attive",
  ML_TEAM_NOT_FOUND: "Squadra non trovata",
  ML_PLAYER_NAME_REQUIRED: "Nome giocatore obbligatorio",
  ML_PLAYER_USER_NOT_FOUND: "Utente collegato non trovato",
  ML_LINKED_USER_IMMUTABLE: "Il collegamento utente storico non può essere sostituito",
  ML_PLAYER_NOT_IN_TEAM: "Giocatore non appartenente alla squadra",
  ML_TEAM_NOT_EDITABLE: "La squadra non è più modificabile",
  ML_PHASE1_NOT_FOUND: "Fase 1 non trovata",
  ML_PHASE1_NOT_GENERATABLE: "La Fase 1 non può essere generata",
  ML_GENERATION_TEAM_SET_INVALID: "Elenco squadre non valido",
  ML_GENERATION_TEAM_SET_MISMATCH: "L’ordine deve includere esattamente tutte le squadre attive",
  ML_GENERATION_PAYLOAD_INVALID: "Calendario generato non valido",
  ML_GENERATION_FINGERPRINT_INVALID: "Fingerprint del calendario non valido",
  ML_GENERATION_FINGERPRINT_PAYLOAD_MISMATCH: "Il calendario non corrisponde al fingerprint",
  ML_GENERATION_ROUND_COUNT_INVALID: "Numero giornate non valido",
  ML_GENERATION_ROUND_INVALID: "Struttura giornata non valida",
  ML_GENERATION_MATCH_INVALID: "Abbinamento non valido",
  ML_GENERATION_MATCH_COUNT_INVALID: "Numero partite non valido",
  ML_GENERATION_DIRTY_DRAFT: "La fase bozza contiene già dati di generazione",
  ML_GENERATION_CONFLICT: "La Fase 1 è già stata generata con un ordine diverso",
};

export function mondayLeagueErrorResponse(error: { message?: string } | null | undefined) {
  const raw = String(error?.message ?? "Errore Monday League");
  const code = Object.keys(FRIENDLY_ERRORS).find((key) => raw.includes(key));
  const conflict = code?.includes("CONFLICT") || code?.includes("NOT_EDITABLE") || code === "ML_GENERATION_DIRTY_DRAFT";
  return NextResponse.json(
    { error: code ? FRIENDLY_ERRORS[code] : raw, code: code ?? "ML_UNKNOWN" },
    { status: conflict ? 409 : 400 }
  );
}

export function slugifyLeagueName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
