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
  ML_SCHEDULE_PHASE_INVALID: "La fase non è schedulabile",
  ML_ROUND_DATES_INVALID: "Elenco date non valido",
  ML_ROUND_DATES_DUPLICATE: "La stessa giornata compare più volte",
  ML_ROUND_NOT_FOUND: "Giornata non trovata",
  ML_ROUND_DATE_NOT_MONDAY: "La data deve essere un lunedì",
  ML_SCHEDULE_VERSION_CONFLICT: "Il calendario è stato modificato da un altro amministratore",
  ML_SCHEDULE_ROUND_INVALID: "Giornata non schedulabile",
  ML_SCHEDULE_ASSIGNMENTS_INVALID: "Le assegnazioni devono includere tutte le partite della giornata",
  ML_SCHEDULE_SLOT_DUPLICATE: "Uno slot ufficiale è stato assegnato più volte",
  ML_SCHEDULE_SLOT_CONFLICT: "Uno slot è già occupato",
  ML_OFFICIAL_SLOT_INVALID: "Sede o orario non appartengono agli slot ufficiali attivi",
  ML_SCHEDULE_MATCH_STATE_INVALID: "Una partita non può essere rischedulata nello stato corrente",
  ML_RESULT_SETS_INVALID: "Set non validi",
  ML_RESULT_SET_COUNT_INVALID: "Un risultato deve contenere due o tre set",
  ML_RESULT_SET_SCORE_INVALID: "Punteggio set non valido",
  ML_RESULT_MATCH_SCORE_INVALID: "Risultato finale non valido",
  ML_RESULT_MATCH_STATE_INVALID: "La partita non accetta risultati nello stato corrente",
  ML_RESULT_ALREADY_EXISTS: "La partita ha già un risultato autoritativo",
  ML_RESULT_VERSION_CONFLICT: "Il risultato è stato modificato da un altro amministratore",
  ML_RESULT_CORRECTION_REASON_REQUIRED: "La correzione richiede una motivazione",
  ML_OUTCOME_VERSION_CONFLICT: "L’esito è stato modificato da un altro amministratore",
  ML_SPECIAL_OUTCOME_INVALID: "Contributo amministrativo non valido",
  ML_MATCH_WORKFLOW_INVALID: "Stato speciale o motivazione non validi",
  ML_CAPTAIN_REQUIRED: "Solo il capitano della squadra può eseguire questa azione",
  ML_MEDIA_PATH_INVALID: "Percorso media non valido",
  ML_ROSTER_LOCKED: "La rosa ufficiale è bloccata",
  ML_CAPTAIN_MUST_REMAIN: "Il capitano deve rimanere nella rosa",
  ML_INVALID_PLAYER: "Giocatore non valido",
  ML_MATCH_TEAM_INVALID: "Squadra o partita non valida",
  ML_LINEUP_LOCKED: "Il termine per la formazione è scaduto",
  ML_LINEUP_EXACTLY_TWO: "La formazione deve contenere esattamente due giocatori distinti",
  ML_LINEUP_ACTIVE_ROSTER_ONLY: "La formazione può includere solo giocatori attivi della squadra",
  ML_OVERRIDE_REASON_REQUIRED: "Dopo il termine è obbligatoria una motivazione",
  ML_REOPEN_REASON_REQUIRED: "La riapertura richiede una motivazione",
  ML_NEW_DEADLINE_NOT_FUTURE: "La nuova scadenza non è futura",
  ML_VISIBILITY_INVALID: "Visibilità non valida",
  ML_SEASON_NOT_FOUND: "Stagione non trovata",
  ML_ONLY_COMPLETED_ARCHIVABLE: "Solo una stagione completata può essere archiviata",
  ML_ACTIVE_SEASON_DELETE_FORBIDDEN: "Una stagione attiva non può essere eliminata definitivamente",
  ML_DELETE_CONFIRMATION_MISMATCH: "La conferma non corrisponde al nome richiesto",
  ML_TEAM_HAS_HISTORY_DEACTIVATE_INSTEAD: "La squadra ha storico sportivo: disattivala invece di eliminarla",
  ML_REASON_REQUIRED: "È richiesta una motivazione",
};

export function mondayLeagueErrorResponse(error: { message?: string } | null | undefined) {
  const raw = String(error?.message ?? "Errore Monday League");
  const code = Object.keys(FRIENDLY_ERRORS).find((key) => raw.includes(key));
  const conflict = code?.includes("CONFLICT") || code?.includes("NOT_EDITABLE") || code === "ML_GENERATION_DIRTY_DRAFT" || code === "ML_RESULT_ALREADY_EXISTS";
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
