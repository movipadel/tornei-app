export const OPERATOR_PERMISSIONS = [
  {
    key: "scanner.manage",
    label: "Scanner / QR",
    description: "Scansione tessere, accredito punti e consegna premi.",
    group: "operations",
    destination: "/staff/operations",
  },
  {
    key: "tournaments.manage",
    label: "Tornei",
    description: "Gestione tornei, iscrizioni e svolgimento.",
    group: "competitions",
    destination: "/admin/tournaments",
  },
  {
    key: "circuits.manage",
    label: "Circuiti",
    description: "Gestione circuiti, tappe e classifiche.",
    group: "competitions",
    destination: "/admin/circuits",
  },
  {
    key: "players.manage",
    label: "Giocatori",
    description: "Gestione anagrafiche e profili giocatore.",
    group: "operations",
    destination: "/admin/players",
  },
  {
    key: "requests.manage",
    label: "Richieste Gioca / Allenati",
    description: "Gestione delle richieste di gioco e allenamento.",
    group: "operations",
    destination: "/admin/requests",
  },
  {
    key: "padelleria.manage",
    label: "Padelleria / Social",
    description: "Gestione dei contenuti editoriali Padelleria.",
    group: "content",
    destination: "/admin/padelleria",
  },
  {
    key: "communications.manage",
    label: "Comunicazioni",
    description: "Gestione delle comunicazioni agli utenti.",
    group: "content",
    destination: "/admin/comunicazioni",
  },
  {
    key: "moviback.manage",
    label: "MoviBack",
    description: "Gestione membership, promozioni e catalogo premi.",
    group: "loyalty",
    destination: "/admin/moviback",
  },
  {
    key: "partners.manage",
    label: "Partner",
    description: "Gestione dei Partner MOVI.",
    group: "content",
    destination: "/admin/partners",
  },
  {
    key: "store.manage",
    label: "Store",
    description: "Gestione catalogo, stock e ordini Store.",
    group: "commerce",
    destination: "/admin/store/products",
  },
  {
    key: "monday_league.manage",
    label: "Monday League",
    description: "Gestione del campionato Monday League.",
    group: "competitions",
    destination: "/admin/monday-league",
  },
] as const;

export type OperatorPermission = (typeof OPERATOR_PERMISSIONS)[number];
export type OperatorPermissionKey = OperatorPermission["key"];
export type OperatorPermissionGroup = OperatorPermission["group"];

const permissionKeys = new Set<string>(OPERATOR_PERMISSIONS.map((item) => item.key));

export function isOperatorPermissionKey(value: unknown): value is OperatorPermissionKey {
  return typeof value === "string" && permissionKeys.has(value);
}

export function operatorPermissionDefinition(key: OperatorPermissionKey) {
  return OPERATOR_PERMISSIONS.find((item) => item.key === key)!;
}

export const ADMIN_ONLY_NAVIGATION = [
  {
    key: "operators",
    label: "Gestione staff",
    description: "Gestisci accessi Admin e Staff.",
    destination: "/admin/users",
  },
  {
    key: "identity-review",
    label: "Duplicati e identità",
    description: "Risolvi verifiche e conflitti di identità.",
    destination: "/admin/users/duplicates",
  },
  {
    key: "access-problems",
    label: "Problemi di accesso",
    description: "Gestisci assistenza e onboarding da completare.",
    destination: "/admin/users/access-problems",
  },
] as const;
