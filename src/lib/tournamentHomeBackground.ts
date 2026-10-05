export const TOURNAMENT_HOME_BACKGROUND_DEFAULT = "/branding/tournament-backgrounds/tournament-default.png";

const BACKGROUNDS = {
  baraonda: {
    maschile: "/branding/tournament-backgrounds/tournament-baraonda-maschile.png",
    femminile: "/branding/tournament-backgrounds/tournament-baraonda-femminile.png",
    misto: "/branding/tournament-backgrounds/tournament-baraonda-misto.png",
    open: "/branding/tournament-backgrounds/tournament-baraonda-open.png",
  },
  coppie: {
    maschile: "/branding/tournament-backgrounds/tournament-coppie-maschile.png",
    femminile: "/branding/tournament-backgrounds/tournament-coppie-femminile.png",
    misto: "/branding/tournament-backgrounds/tournament-coppie-misto.png",
    open: "/branding/tournament-backgrounds/tournament-coppie-open.png",
  },
} as const;

type TournamentHomeType = keyof typeof BACKGROUNDS;
type TournamentHomeCategory = keyof (typeof BACKGROUNDS)[TournamentHomeType];

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLocaleLowerCase("it-IT");
}

export function normalizeTournamentHomeType(type: string | null | undefined): TournamentHomeType | null {
  const value = normalize(type);
  if (value === "baraonda") return "baraonda";
  if (value === "coppie fisse") return "coppie";
  return null;
}

export function normalizeTournamentHomeCategory(category: string | null | undefined): TournamentHomeCategory | null {
  const value = normalize(category);
  if (value === "maschile") return "maschile";
  if (value === "femminile") return "femminile";
  if (value === "misto") return "misto";
  if (value === "libero" || value === "open") return "open";
  return null;
}

export function getTournamentHomeBackground(type: string | null | undefined, category: string | null | undefined) {
  const normalizedType = normalizeTournamentHomeType(type);
  const normalizedCategory = normalizeTournamentHomeCategory(category);
  if (!normalizedType || !normalizedCategory) return TOURNAMENT_HOME_BACKGROUND_DEFAULT;
  return BACKGROUNDS[normalizedType][normalizedCategory];
}
