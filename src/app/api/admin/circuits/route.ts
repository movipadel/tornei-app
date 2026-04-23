import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type TournamentType = "Baraonda" | "Coppie fisse";
type CircuitStatus = "draft" | "active" | "closed";
type Category = "Maschile" | "Femminile" | "Misto" | "Libero";
type Level = "principiante" | "intermedio" | "avanzato" | "open";
type RuleType = "placement" | "stage";
type Stage = "winner" | "finalist" | "semifinalist" | "quarterfinalist" | "others";

type RankingGroupInput = {
  category: Category;
  level: Level;
};

type PointsRuleInput =
  | {
      min_admissions: number;
      max_admissions: number;
      rule_type: "placement";
      placement: number;
      stage?: null;
      points: number;
    }
  | {
      min_admissions: number;
      max_admissions: number;
      rule_type: "stage";
      placement?: null;
      stage: Stage;
      points: number;
    };

type CircuitPayload = {
  name: string;
  slug: string;
  tournament_type: TournamentType;
  status: CircuitStatus;
  hero_logo_url: string | null;
  hero_logo_2_url: string | null;
  hero_logo_3_url: string | null;
  hero_subtitle: string | null;
  theme_key: string | null;
  rules_url: string | null;
  ranking_groups: RankingGroupInput[];
  points_rules: PointsRuleInput[];
};

const VALID_TYPES = new Set<TournamentType>(["Baraonda", "Coppie fisse"]);
const VALID_STATUS = new Set<CircuitStatus>(["draft", "active", "closed"]);
const VALID_CATEGORIES = new Set<Category>(["Maschile", "Femminile", "Misto", "Libero"]);
const VALID_LEVELS = new Set<Level>(["principiante", "intermedio", "avanzato", "open"]);
const VALID_RULE_TYPES = new Set<RuleType>(["placement", "stage"]);
const VALID_STAGES = new Set<Stage>([
  "winner",
  "finalist",
  "semifinalist",
  "quarterfinalist",
  "others",
]);

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parsePositiveInt(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}

function parseOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parsePayload(body: any): CircuitPayload {
  const name = String(body?.name ?? "").trim();
  const slugRaw = String(body?.slug ?? "").trim();
  const slug = normalizeSlug(slugRaw || name);

  const tournament_type = String(body?.tournament_type ?? "").trim() as TournamentType;
  const status = String(body?.status ?? "draft").trim() as CircuitStatus;

  const hero_logo_url = parseOptionalText(body?.hero_logo_url);
  const hero_logo_2_url = parseOptionalText(body?.hero_logo_2_url);
  const hero_logo_3_url = parseOptionalText(body?.hero_logo_3_url);
  const hero_subtitle = parseOptionalText(body?.hero_subtitle);
  const theme_key = parseOptionalText(body?.theme_key);
  const rules_url = parseOptionalText(body?.rules_url);

  const ranking_groups = Array.isArray(body?.ranking_groups) ? body.ranking_groups : [];
  const points_rules = Array.isArray(body?.points_rules) ? body.points_rules : [];

  if (!name) throw new Error("Nome circuito obbligatorio");
  if (!slug) throw new Error("Slug circuito obbligatorio");
  if (!VALID_TYPES.has(tournament_type)) throw new Error("Tipo circuito non valido");
  if (!VALID_STATUS.has(status)) throw new Error("Stato circuito non valido");
  if (!ranking_groups.length) throw new Error("Seleziona almeno una classifica categoria/livello");

  const normalizedGroups: RankingGroupInput[] = ranking_groups.map((g: any) => {
    const category = String(g?.category ?? "").trim() as Category;
    const level = String(g?.level ?? "").trim() as Level;

    if (!VALID_CATEGORIES.has(category)) {
      throw new Error(`Categoria non valida: ${category || "-"}`);
    }
    if (!VALID_LEVELS.has(level)) {
      throw new Error(`Livello non valido: ${level || "-"}`);
    }

    return { category, level };
  });

  const seenGroups = new Set<string>();
  for (const g of normalizedGroups) {
    const key = `${g.category}__${g.level}`;
    if (seenGroups.has(key)) {
      throw new Error(`Classifica duplicata: ${g.category} / ${g.level}`);
    }
    seenGroups.add(key);
  }

  const normalizedRules: PointsRuleInput[] = [];

  for (const raw of points_rules) {
    const min_admissions = parsePositiveInt(raw?.min_admissions);
    const max_admissions = parsePositiveInt(raw?.max_admissions);
    const rule_type = String(raw?.rule_type ?? "").trim() as RuleType;

    if (raw?.points === "" || raw?.points === null || raw?.points === undefined) {
      continue;
    }

    const points = Number(raw?.points);

    if (!Number.isInteger(min_admissions) || min_admissions <= 0) {
      throw new Error("min_admissions non valido");
    }
    if (!Number.isInteger(max_admissions) || max_admissions < min_admissions) {
      throw new Error("max_admissions non valido");
    }
    if (!VALID_RULE_TYPES.has(rule_type)) {
      throw new Error("rule_type non valido");
    }
    if (!Number.isInteger(points) || points < 0) {
      throw new Error("points non valido");
    }

    if (rule_type === "placement") {
      const placement = parsePositiveInt(raw?.placement);
      if (!Number.isInteger(placement) || placement <= 0) {
        throw new Error("placement non valido");
      }

      normalizedRules.push({
        min_admissions,
        max_admissions,
        rule_type: "placement",
        placement,
        points,
      });
    } else {
      const stage = String(raw?.stage ?? "").trim() as Stage;
      if (!VALID_STAGES.has(stage)) {
        throw new Error("stage non valido");
      }

      normalizedRules.push({
        min_admissions,
        max_admissions,
        rule_type: "stage",
        stage,
        points,
      });
    }
  }

  const seenRules = new Set<string>();
  for (const rule of normalizedRules) {
    const uniqueKey =
      rule.rule_type === "placement"
        ? `${rule.min_admissions}__${rule.max_admissions}__placement__${rule.placement}`
        : `${rule.min_admissions}__${rule.max_admissions}__stage__${rule.stage}`;

    if (seenRules.has(uniqueKey)) {
      throw new Error("Regole punti duplicate rilevate");
    }
    seenRules.add(uniqueKey);
  }

  return {
    name,
    slug,
    tournament_type,
    status,
    hero_logo_url,
    hero_logo_2_url,
    hero_logo_3_url,
    hero_subtitle,
    theme_key,
    rules_url,
    ranking_groups: normalizedGroups,
    points_rules: normalizedRules,
  };
}

async function createCircuitWithRelations(
  sb: ReturnType<typeof supabaseAdmin>,
  payload: CircuitPayload
) {
  const { data: circuit, error: circuitErr } = await sb
    .from("circuits")
    .insert({
      name: payload.name,
      slug: payload.slug,
      tournament_type: payload.tournament_type,
      status: payload.status,
      hero_logo_url: payload.hero_logo_url,
      hero_logo_2_url: payload.hero_logo_2_url,
      hero_logo_3_url: payload.hero_logo_3_url,
      hero_subtitle: payload.hero_subtitle,
      theme_key: payload.theme_key,
      rules_url: payload.rules_url,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (circuitErr) throw new Error(circuitErr.message);
  if (!circuit) throw new Error("Circuito non creato");

  const groupRows = payload.ranking_groups.map((g) => ({
    circuit_id: circuit.id,
    category: g.category,
    level: g.level,
  }));

  const { error: groupsErr } = await sb.from("circuit_ranking_groups").insert(groupRows);
  if (groupsErr) throw new Error(groupsErr.message);

  if (payload.points_rules.length) {
    const ruleRows = payload.points_rules.map((r) => ({
      circuit_id: circuit.id,
      min_admissions: r.min_admissions,
      max_admissions: r.max_admissions,
      rule_type: r.rule_type,
      placement: r.rule_type === "placement" ? r.placement : null,
      stage: r.rule_type === "stage" ? r.stage : null,
      points: r.points,
    }));

    const { error: rulesErr } = await sb.from("circuit_points_rules").insert(ruleRows);
    if (rulesErr) throw new Error(rulesErr.message);
  }

  return circuit;
}

export async function GET(req: Request) {
  const denied = await guardAdmin(req);
  if (denied) return denied;

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("circuits")
    .select(`
      id,
      name,
      slug,
      tournament_type,
      status,
      hero_logo_url,
      hero_logo_2_url,
      hero_logo_3_url,
      hero_subtitle,
      theme_key,
      rules_url,
      created_at,
      updated_at,
      circuit_ranking_groups (
        category,
        level
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const denied = await guardAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  try {
    const payload = parsePayload(body);
    const sb = supabaseAdmin();

    const circuit = await createCircuitWithRelations(sb, payload);

    return NextResponse.json({ data: circuit }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Errore creazione circuito" },
      { status: 400 }
    );
  }
}