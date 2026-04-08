import type {
  BaraondaContext,
  Participant,
  Turn,
  ValidationIssue,
  ValidationReport,
} from "../domain/types";

export function validateStructure(
  context: BaraondaContext,
  turns: Turn[],
  participants: Participant[]
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const participantMap = buildParticipantMap(participants);

  for (const turn of turns) {
    const usedInTurn = new Set<string>();

    for (const match of turn.matches) {
      const players = match.players;

      // 1. Match deve avere 4 giocatori
      if (players.length !== 4) {
        issues.push({
          code: "INVALID_MATCH_SIZE",
          severity: "error",
          message: buildLocationMessage(
            `Match con numero giocatori diverso da 4 (${players.length}).`,
            turn.turnNumber,
            match.matchNumber
          ),
        });
        continue;
      }

      const ids = players.map((p) => p.id);

      // 2. No duplicati nello stesso match
      const uniqueIds = new Set(ids);
      if (uniqueIds.size !== 4) {
        issues.push({
          code: "DUPLICATE_PLAYER_IN_MATCH",
          severity: "error",
          message: buildLocationMessage(
            "Un giocatore compare più volte nello stesso match.",
            turn.turnNumber,
            match.matchNumber
          ),
        });
      }

      // 3. Tutti i player devono esistere
      for (const player of players) {
        if (!participantMap[player.id]) {
          issues.push({
            code: "UNKNOWN_PLAYER",
            severity: "error",
            message: buildLocationMessage(
              `Giocatore non riconosciuto: ${player.name}`,
              turn.turnNumber,
              match.matchNumber
            ),
          });
        }
      }

      // 4. Misto: team uomo + donna
      if (context.isMixed) {
        validateMixedTeam(players[0], players[1], issues, turn.turnNumber, match.matchNumber);
        validateMixedTeam(players[2], players[3], issues, turn.turnNumber, match.matchNumber);
      }

      // 5. Nessun player in due match nello stesso turno
      for (const playerId of ids) {
        if (usedInTurn.has(playerId)) {
          issues.push({
            code: "PLAYER_DOUBLE_IN_TURN",
            severity: "error",
            message: buildLocationMessage(
              `Giocatore presente in più match nello stesso turno.`,
              turn.turnNumber,
              match.matchNumber
            ),
          });
        } else {
          usedInTurn.add(playerId);
        }
      }
    }
  }

  return {
    valid: !issues.some((i) => i.severity === "error"),
    summary: buildSummary(issues),
    issues,
  };
}

function buildParticipantMap(
  participants: Participant[]
): Record<string, Participant> {
  const map: Record<string, Participant> = {};

  for (const p of participants) {
    map[p.id] = p;
  }

  return map;
}

function validateMixedTeam(
  p1: Participant,
  p2: Participant,
  issues: ValidationIssue[],
  turnNumber?: number,
  matchNumber?: number
) {
  if (!p1.sex || !p2.sex) {
    issues.push({
      code: "MIXED_SEX_MISSING",
      severity: "error",
      message: buildLocationMessage(
        "Nel misto ogni giocatore deve avere il sesso definito.",
        turnNumber,
        matchNumber
      ),
    });
    return;
  }

  if (p1.sex === p2.sex) {
    issues.push({
      code: "INVALID_MIXED_TEAM",
      severity: "error",
      message: buildLocationMessage(
        `Team non valido (stesso sesso): ${p1.name} - ${p2.name}`,
        turnNumber,
        matchNumber
      ),
    });
  }
}

function buildLocationMessage(
  base: string,
  turnNumber?: number,
  matchNumber?: number
): string {
  if (turnNumber == null && matchNumber == null) return base;

  if (turnNumber != null && matchNumber != null) {
    return `${base} (Turno ${turnNumber}, Match ${matchNumber})`;
  }

  if (turnNumber != null) return `${base} (Turno ${turnNumber})`;

  return `${base} (Match ${matchNumber})`;
}

function buildSummary(issues: ValidationIssue[]): string {
  if (issues.length === 0) return "Struttura valida";

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;

  return `Struttura non valida: ${errors} errori, ${warnings} warning`;
}