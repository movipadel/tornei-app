import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";


function esc(v: any, sep: string) {
  const s = String(v ?? "");
  // se contiene separatore, virgolette o newline -> quota
  if (s.includes(sep) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsvLine(values: any[], sep: string) {
  return values.map((v) => esc(v, sep)).join(sep);
}

function normalizePhone(p: string | null) {
  if (!p) return "";
  return String(p).replace(/\s+/g, "").trim();
}

function formatStart(date: string | null, time: string | null) {
  if (!date && !time) return "";
  if (date && time) return `${date} ${time}`;
  return date ?? time ?? "";
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guardAdmin(req);
  if (denied) return denied;


  const { id } = await ctx.params;
  const sb = supabaseAdmin();

  // 1) Torneo (schema legacy: date + time + max_participants)
  const { data: t, error: terr } = await sb
    .from("tournaments")
    .select("id,name,type,category,location,date,time,max_participants")
    .eq("id", id)
    .single();

  if (terr || !t) return new Response(terr?.message ?? "Tournament not found", { status: 404 });

  // 2) Registrazioni
  const { data, error } = await sb
    .from("tournament_registrations")
    .select("position,is_reserve,p1_name,p1_phone,p1_gender,p2_name,p2_phone,p2_gender,notes,created_at")
    .eq("tournament_id", id)
    .order("is_reserve", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return new Response(error.message, { status: 500 });

  const sep = ";";
  const start = formatStart((t as any).date ?? null, (t as any).time ?? null);

  const all = data ?? [];
  const main = all.filter((r: any) => !r.is_reserve);
  const reserve = all.filter((r: any) => r.is_reserve);

  const isCouples = String((t as any).type) === "Coppie fisse";

  // Header “metadati” (righe commento)
  const metaLines: string[] = [];
  metaLines.push(toCsvLine(["TORNEO", (t as any).name ?? ""], sep));
  metaLines.push(toCsvLine(["TIPO", (t as any).type ?? ""], sep));
  metaLines.push(toCsvLine(["CATEGORIA", (t as any).category ?? ""], sep));
  metaLines.push(toCsvLine(["DATA ORA", start], sep));
  metaLines.push(toCsvLine(["LUOGO", (t as any).location ?? ""], sep));
  metaLines.push(toCsvLine(["MAX", (t as any).max_participants ?? ""], sep));
  metaLines.push(""); // riga vuota

  // Colonne
  const headerCommon = [
    "lista",                 // MAIN / RISERVA
    isCouples ? "coppia" : "posizione", // slot
    "p1_nome",
    "p1_telefono",
    "p1_sesso",
  ];

  const headerCouplesExtra = isCouples
    ? ["p2_nome", "p2_telefono", "p2_sesso"]
    : [];

  const headerTail = ["note", "inserita_il"];

  const header = [...headerCommon, ...headerCouplesExtra, ...headerTail];

  // Sezione builder
  function section(title: string, rows: any[], label: "MAIN" | "RISERVA") {
    const lines: string[] = [];
    lines.push(toCsvLine([title], sep));
    lines.push(toCsvLine(header, sep));

    for (const r of rows) {
      const base = [
        label,
        r.position ?? "",
        r.p1_name ?? "",
        normalizePhone(r.p1_phone ?? ""),
        r.p1_gender ?? "",
      ];

      const couples = isCouples
        ? [
            r.p2_name ?? "",
            normalizePhone(r.p2_phone ?? ""),
            r.p2_gender ?? "",
          ]
        : [];

      const tail = [
        r.notes ?? "",
        r.created_at ?? "",
      ];

      lines.push(toCsvLine([...base, ...couples, ...tail], sep));
    }

    if (rows.length === 0) {
      lines.push(toCsvLine([label, "", "(nessuno)"], sep));
    }

    lines.push(""); // riga vuota dopo sezione
    return lines;
  }

  const lines = [
    ...metaLines,
    ...section("LISTA PRINCIPALE", main, "MAIN"),
    ...section("LISTA RISERVA", reserve, "RISERVA"),
  ];

  // BOM per Excel + UTF-8
  const bom = "\uFEFF";
  const csv = bom + lines.join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="torneo_${id}_iscrizioni.csv"`,
    },
  });
}
