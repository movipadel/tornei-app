import "server-only";

export function authRedirect(path: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function validPassword(value: unknown) {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

export const genericEmailMessage =
  "Se l'indirizzo può essere utilizzato, riceverai un'email con i prossimi passi.";
