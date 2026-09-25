export function maskEmail(email: string | null | undefined) {
  const [local, domain] = String(email ?? "").trim().split("@");
  if (!local || !domain) return "email non disponibile";
  const parts = local.split(/[._-]/);
  const masked = parts.map((part) => {
    if (!part) return "";
    if (part.length <= 2) return `${part[0]}***`;
    const tail = /\d{2}$/.test(part) ? part.slice(-2) : "";
    return `${part[0]}${"*".repeat(Math.min(Math.max(part.length - 1 - tail.length, 3), 8))}${tail}`;
  }).join(".");
  return `${masked}@${domain}`;
}

export function maskPhone(phone: string | null | undefined) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `••••••${digits.slice(-4)}` : "telefono non disponibile";
}
