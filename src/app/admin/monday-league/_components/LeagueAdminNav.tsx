import Link from "next/link";

const links = [
  ["Panoramica", "/admin/monday-league"],
  ["Squadre", "/admin/monday-league/squadre"],
  ["Genera calendario", "/admin/monday-league/calendario/genera"],
  ["Calendario", "/admin/monday-league/calendario"],
  ["Classifica", "/admin/monday-league/classifica"],
  ["Risultati", "/admin/monday-league/risultati"],
] as const;

export default function LeagueAdminNav() {
  return (
    <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }} aria-label="Monday League">
      {links.map(([label, href]) => (
        <Link key={href} href={href} style={{ padding: "9px 13px", borderRadius: 999, color: "#0f766e", background: "#ccfbf1", border: "1px solid #99f6e4", textDecoration: "none", fontWeight: 800, fontSize: 13 }}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
