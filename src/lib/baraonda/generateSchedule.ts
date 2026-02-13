// src/lib/baraonda/generateSchedule.ts

export type Sex = "m" | "f";

export interface Participant {
  id: string;
  name: string;
  sex: Sex;
}

export interface BaraondaRules {
  players: number;
  matchesPerTurn: number; // 1 o 2
  turns: number;
  matchesPerPlayer: number;
  category: "maschile" | "femminile" | "libero" | "misto";
}

export interface Match {
  matchNumber: number;
  players: [Participant, Participant, Participant, Participant]; // [t1p1,t1p2,t2p1,t2p2]
}

export interface Turn {
  turnNumber: number;
  matches: Match[];
  resting: Participant[];
}

type TeamSplit = {
  team1: [Participant, Participant];
  team2: [Participant, Participant];
  players: [Participant, Participant, Participant, Participant];
};

function incNested(map: Map<string, Map<string, number>>, a: string, b: string, by = 1) {
  const row = map.get(a) ?? new Map<string, number>();
  row.set(b, (row.get(b) ?? 0) + by);
  map.set(a, row);
}

function getNested(map: Map<string, Map<string, number>>, a: string, b: string) {
  return map.get(a)?.get(b) ?? 0;
}

export function generateBaraondaSchedule(participants: Participant[], rules: BaraondaRules): Turn[] {
  const { matchesPerTurn, turns, matchesPerPlayer, category } = rules;

  const activeSlots = matchesPerTurn * 4;

  // quante volte ha giocato / riposato
  const played = new Map<string, number>();
  const rested = new Map<string, number>();

  // quante volte A ha giocato CON B (stesso team)
  const teammateCount = new Map<string, Map<string, number>>();
  // quante volte A ha giocato CONTRO B (avversari)
  const opponentCount = new Map<string, Map<string, number>>();

  participants.forEach((p) => {
    played.set(p.id, 0);
    rested.set(p.id, 0);
    teammateCount.set(p.id, new Map());
    opponentCount.set(p.id, new Map());
  });

  // ✅ CHECK MISTO: M e F uguali + fattibilità "coppie uniche"
  if (category === "misto") {
    const males = participants.filter((p) => p.sex === "m").length;
    const females = participants.filter((p) => p.sex === "f").length;

    if (males !== females) {
      throw new Error(`Baraonda misto richiede stesso numero M/F (M=${males}, F=${females})`);
    }

    // ogni match usa 2 coppie (team1 e team2) => 2 coppie per match
    // coppie per turno = matchesPerTurn * 2
    const pairsPerTurn = matchesPerTurn * 2;
    const totalPairsNeeded = pairsPerTurn * turns; // quante coppie M-F diverse servono in tutto il torneo
    const maxUniquePairs = males * females; // quante coppie M-F uniche esistono

    if (totalPairsNeeded > maxUniquePairs) {
      throw new Error(
        `Impossibile rispettare la regola MISTO (coppie M-F mai ripetute): ` +
          `servono ${totalPairsNeeded} coppie uniche ma massimo possibile è ${maxUniquePairs}. ` +
          `Riduci i turni o il matchesPerTurn.`
      );
    }
  }

  const turnsResult: Turn[] = [];

  for (let t = 1; t <= turns; t++) {
    // 1) scegli chi gioca (bilancia play/rest)
    const sorted = [...participants].sort((a, b) => {
      const pa = (played.get(a.id) ?? 0) - (rested.get(a.id) ?? 0);
      const pb = (played.get(b.id) ?? 0) - (rested.get(b.id) ?? 0);
      return pa - pb;
    });

    const active: Participant[] = [];
    const resting: Participant[] = [];

    for (const p of sorted) {
      if (active.length < activeSlots && (played.get(p.id) ?? 0) < matchesPerPlayer) {
        active.push(p);
      } else {
        resting.push(p);
        rested.set(p.id, (rested.get(p.id) ?? 0) + 1);
      }
    }

    // 2) crea match scegliendo gruppi + split team ottimo
    const matches: Match[] = [];
    let matchNumber = 1;

    while (active.length >= 4) {
      const pick = pickBestGroupAndSplit(active, teammateCount, opponentCount, category);

      const { players, team1, team2 } = pick;

      // aggiorna played
      players.forEach((p) => played.set(p.id, (played.get(p.id) ?? 0) + 1));

      // registra compagni / avversari
      registerMatchRelations(team1, team2, teammateCount, opponentCount);

      matches.push({
        matchNumber,
        players,
      });

      matchNumber++;
    }

    turnsResult.push({
      turnNumber: t,
      matches,
      resting,
    });
  }

  return turnsResult;
}

/* ================= HELPERS ================= */

function allTeamSplits(group: [Participant, Participant, Participant, Participant]): TeamSplit[] {
  const [a, b, c, d] = group;

  // 3 split unici
  return [
    { team1: [a, b], team2: [c, d], players: [a, b, c, d] },
    { team1: [a, c], team2: [b, d], players: [a, c, b, d] },
    { team1: [a, d], team2: [b, c], players: [a, d, b, c] },
  ];
}

function isMixedTeam(t: [Participant, Participant]) {
  return t[0].sex !== t[1].sex;
}

function hasRepeatedTeammatePair(team: [Participant, Participant], teammateCount: Map<string, Map<string, number>>) {
  const [x, y] = team;
  return getNested(teammateCount, x.id, y.id) > 0 || getNested(teammateCount, y.id, x.id) > 0;
}

/**
 * ✅ MISTO: HARD RULE ASSOLUTA
 * - se category === "misto", scegli SOLO split che NON ripetono coppie M-F (compagni).
 * - se per quel turno non esiste NESSUNA soluzione valida, lancia errore (così non infrangiamo mai la regola).
 */
function pickBestGroupAndSplit(
  pool: Participant[],
  teammateCount: Map<string, Map<string, number>>,
  opponentCount: Map<string, Map<string, number>>,
  category: string
): TeamSplit {
  let bestScore = Infinity;
  let bestPick: TeamSplit | null = null;
  let bestGroup: Participant[] = [];

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        for (let l = k + 1; l < pool.length; l++) {
          const group = [pool[i], pool[j], pool[k], pool[l]] as [
            Participant,
            Participant,
            Participant,
            Participant
          ];

          // vincolo misto: gruppo deve essere 2M + 2F
          if (category === "misto") {
            const males = group.filter((p) => p.sex === "m").length;
            const females = group.filter((p) => p.sex === "f").length;
            if (males !== 2 || females !== 2) continue;
          }

          for (const split of allTeamSplits(group)) {
            if (category === "misto") {
              // misto: ogni team deve essere 1M+1F
              if (!isMixedTeam(split.team1) || !isMixedTeam(split.team2)) continue;

              // ✅ HARD: niente coppie compagni già viste (in tutto il torneo)
              if (hasRepeatedTeammatePair(split.team1, teammateCount)) continue;
              if (hasRepeatedTeammatePair(split.team2, teammateCount)) continue;
            }

            const score = scoreSplit(split, teammateCount, opponentCount);

            if (score < bestScore) {
              bestScore = score;
              bestPick = split;
              bestGroup = group;
            }
          }
        }
      }
    }
  }

  // ✅ se misto e non troviamo soluzioni valide, STOP (non barare)
  if (category === "misto" && !bestPick) {
    throw new Error(
      "Impossibile generare turno MISTO senza ripetere coppie uomo-donna. " +
        "Riduci i turni o cambia preset (altrimenti la regola è matematicamente impossibile)."
    );
  }

  // fallback (non dovrebbe succedere nelle altre categorie)
  if (!bestPick) {
    const g = pool.slice(0, 4) as [Participant, Participant, Participant, Participant];
    bestPick = allTeamSplits(g)[0];
    bestGroup = g;
  }

  // rimuovi dal pool i 4 scelti
  for (const p of bestGroup) {
    const idx = pool.findIndex((x) => x.id === p.id);
    if (idx >= 0) pool.splice(idx, 1);
  }

  return bestPick;
}

/**
 * Score generale (tutte le categorie):
 * - minimizza compagni ripetuti
 * - minimizza avversari ripetuti
 *
 * Nota: nel MISTO le ripetizioni compagni sono già vietate (HARD),
 * quindi qui lavora soprattutto sugli avversari.
 */
function scoreSplit(
  split: TeamSplit,
  teammateCount: Map<string, Map<string, number>>,
  opponentCount: Map<string, Map<string, number>>
): number {
  const W_TEAMMATE = 120; // ripetere compagno è male (altre categorie)
  const W_OPPONENT = 80;  // ✅ più forte: vogliamo cambiare avversari spesso

  let score = 0;

  const [a, b] = split.team1;
  const [c, d] = split.team2;

  // penalità compagni ripetuti (A con B, C con D)
  score += getNested(teammateCount, a.id, b.id) * W_TEAMMATE;
  score += getNested(teammateCount, b.id, a.id) * W_TEAMMATE;
  score += getNested(teammateCount, c.id, d.id) * W_TEAMMATE;
  score += getNested(teammateCount, d.id, c.id) * W_TEAMMATE;

  // penalità avversari ripetuti: ogni player contro i due avversari
  const t1 = [a, b];
  const t2 = [c, d];

  for (const p of t1) for (const o of t2) score += getNested(opponentCount, p.id, o.id) * W_OPPONENT;
  for (const p of t2) for (const o of t1) score += getNested(opponentCount, p.id, o.id) * W_OPPONENT;

  return score;
}

function registerMatchRelations(
  team1: [Participant, Participant],
  team2: [Participant, Participant],
  teammateCount: Map<string, Map<string, number>>,
  opponentCount: Map<string, Map<string, number>>
) {
  const [a, b] = team1;
  const [c, d] = team2;

  // compagni
  incNested(teammateCount, a.id, b.id, 1);
  incNested(teammateCount, b.id, a.id, 1);
  incNested(teammateCount, c.id, d.id, 1);
  incNested(teammateCount, d.id, c.id, 1);

  // avversari
  for (const p of [a, b]) for (const o of [c, d]) incNested(opponentCount, p.id, o.id, 1);
  for (const p of [c, d]) for (const o of [a, b]) incNested(opponentCount, p.id, o.id, 1);
}
