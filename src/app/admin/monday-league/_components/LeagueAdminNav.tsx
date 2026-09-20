import Link from "next/link";

const links = [
  ["Panoramica", "/admin/monday-league"],
  ["Squadre", "/admin/monday-league/squadre"],
  ["Genera calendario", "/admin/monday-league/calendario/genera"],
] as const;

export default function LeagueAdminNav() {
  return (
    <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }} aria-label="Monday League">
      {links.map(([label, href]) => (
        <Link key={href} href={href} style={{ padding: "9px 13px", borderRadius: 999, color: "#ccfbf1", background: "rgba(20,184,166,.12)", border: "1px solid rgba(94,234,212,.18)", textDecoration: "none", fontWeight: 800, fontSize: 13 }}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
