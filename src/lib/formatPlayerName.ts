export function formatPlayerName(raw: string | null | undefined) {
  if (!raw) return "";

  const clean = raw.trim().toUpperCase();
  const parts = clean.split(/\s+/).filter(Boolean);

  if (parts.length === 1) return parts[0];

  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");

  return `${firstName.charAt(0)}.${lastName}`;
}
