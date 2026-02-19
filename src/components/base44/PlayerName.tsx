"use client";

export function GenderMark({ gender }: { gender?: "M" | "F" | "m" | "f" | null }) {
  if (!gender) return null;
  const g = String(gender).toUpperCase();
  const cls = g === "M" ? "male" : "female";
  return (
    <span className={`base44-gender-mark ${cls}`} aria-label={g === "M" ? "Uomo" : "Donna"}>
      {g === "M" ? "♂" : "♀"}
    </span>
  );
}

export function PlayerName({
  name,
  gender,
}: {
  name?: string | null;
  gender?: "M" | "F" | "m" | "f" | null;
}) {
  if (!name) return <span>-</span>;
  return (
    <span>
      <span className="base44-player-name">{name}</span>
      <GenderMark gender={gender} />
    </span>
  );
}
