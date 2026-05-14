import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardStaff, getStaffSessionOrNull } from "@/lib/staffGuard";

export const runtime = "nodejs";

const ALLOWED_CLUBS = [
  "CENTALLO",
  "COSTIGLIOLE",
  "MANTA",
  "SALUZZO",
  "REVELLO",
];

const CF_MONTHS: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  H: 6,
  L: 7,
  M: 8,
  P: 9,
  R: 10,
  S: 11,
  T: 12,
};

function getMembershipMultiplier(membershipType: string | null) {
  return membershipType === "FITP" ? 1.2 : 1;
}

function getRomeNowParts() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";

  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = String(get("hour")).padStart(2, "0");
  const minute = String(get("minute")).padStart(2, "0");

  const jsDate = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00`);
  const jsDay = jsDate.getDay(); // 0 domenica, 1 lunedì...
  const dayOfWeek = jsDay === 0 ? 7 : jsDay; // 1 lunedì ... 7 domenica

  return {
    now,
    year,
    month,
    day,
    dayOfWeek,
    time: `${hour}:${minute}`,
  };
}

function parseTaxCode(taxCode: string | null) {
  const cf = String(taxCode || "").trim().toUpperCase();

  if (cf.length < 11) return null;

  const yearCode = Number(cf.slice(6, 8));
  const monthCode = cf.slice(8, 9);
  const rawDay = Number(cf.slice(9, 11));

  const month = CF_MONTHS[monthCode];

  if (!Number.isFinite(yearCode) || !month || !Number.isFinite(rawDay)) {
    return null;
  }

  const gender = rawDay > 40 ? "F" : "M";
  const day = rawDay > 40 ? rawDay - 40 : rawDay;

  if (day < 1 || day > 31) return null;

  const currentYear = new Date().getFullYear();
  const currentTwo = currentYear % 100;
  const century = yearCode <= currentTwo ? 2000 : 1900;
  const year = century + yearCode;

  return {
    birthDate: new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00`),
    birthYear: year,
    birthMonth: month,
    birthDay: day,
    gender,
  };
}

function getAge(birthDate: Date, nowParts: ReturnType<typeof getRomeNowParts>) {
  let age = nowParts.year - birthDate.getFullYear();

  const birthMonth = birthDate.getMonth() + 1;
  const birthDay = birthDate.getDate();

  if (
    nowParts.month < birthMonth ||
    (nowParts.month === birthMonth && nowParts.day < birthDay)
  ) {
    age -= 1;
  }

  return age;
}

function timeMatches(startTime: string | null, endTime: string | null, current: string) {
  if (!startTime || !endTime) return false;

  const start = startTime.slice(0, 5);
  const end = endTime.slice(0, 5);

  if (start <= end) {
    return current >= start && current <= end;
  }

  // fascia che attraversa mezzanotte, es. 22:00-02:00
  return current >= start || current <= end;
}

function promoScheduleMatches(promo: any, nowParts: ReturnType<typeof getRomeNowParts>) {
  if (promo.schedule_type === "always") return true;

  if (promo.schedule_type === "weekend") {
    return nowParts.dayOfWeek === 6 || nowParts.dayOfWeek === 7;
  }

  if (promo.schedule_type === "weekdays") {
    return Array.isArray(promo.days_of_week)
      ? promo.days_of_week.includes(nowParts.dayOfWeek)
      : false;
  }

  if (promo.schedule_type === "time_window") {
    return timeMatches(promo.start_time, promo.end_time, nowParts.time);
  }

  return false;
}

function promoTargetMatches(promo: any, membership: any, nowParts: ReturnType<typeof getRomeNowParts>) {
  if (promo.target_type === "all") return true;

  if (promo.target_type === "new_members") {
    const days = Number(promo.new_member_days || 0);
    if (!days || !membership.created_at) return false;

    const created = new Date(membership.created_at);
    const diffMs = nowParts.now.getTime() - created.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    return diffDays >= 0 && diffDays <= days;
  }

  const parsedCf = parseTaxCode(membership.tax_code);
  if (!parsedCf) return false;

  if (promo.target_type === "birthday") {
    return (
      parsedCf.birthMonth === nowParts.month &&
      parsedCf.birthDay === nowParts.day
    );
  }

  if (promo.target_type === "gender") {
    return parsedCf.gender === promo.target_gender;
  }

  if (promo.target_type === "age_range") {
    const age = getAge(parsedCf.birthDate, nowParts);

    const minAge =
      promo.min_age === null || promo.min_age === undefined
        ? null
        : Number(promo.min_age);

    const maxAge =
      promo.max_age === null || promo.max_age === undefined
        ? null
        : Number(promo.max_age);

    if (minAge !== null && age < minAge) return false;
    if (maxAge !== null && age > maxAge) return false;

    return true;
  }

  return false;
}

export async function POST(req: Request) {
  const denied = await guardStaff();
  if (denied) return denied;

  const session = await getStaffSessionOrNull();

  if (!session?.sid) {
    return NextResponse.json(
      { error: "Sessione staff non valida" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));

  const membershipCode = String(body.membership_code ?? "").trim();
  const euroAmount = Number(body.euro_amount ?? 0);
  const club = String(body.club ?? "").trim().toUpperCase();

  if (!membershipCode) {
    return NextResponse.json(
      { error: "Codice tessera richiesto" },
      { status: 400 }
    );
  }

  if (!Number.isFinite(euroAmount) || euroAmount <= 0) {
    return NextResponse.json({ error: "Importo non valido" }, { status: 400 });
  }

  if (!ALLOWED_CLUBS.includes(club)) {
    return NextResponse.json({ error: "Sede non valida" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: membership, error: membershipErr } = await sb
    .from("loyalty_memberships")
    .select("id,status,membership_type,tax_code,created_at")
    .eq("membership_code", membershipCode)
    .maybeSingle();

  if (membershipErr) {
    return NextResponse.json({ error: membershipErr.message }, { status: 500 });
  }

  if (!membership) {
    return NextResponse.json(
      { error: "Membership non trovata" },
      { status: 404 }
    );
  }

  if (membership.status !== "approved") {
    return NextResponse.json(
      {
        error:
          "MoviBack non attivo: puoi accreditare punti solo a tessere approvate",
      },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  const nowParts = getRomeNowParts();

  const { data: individualPromo, error: individualPromoErr } = await sb
    .from("loyalty_user_promos")
    .select("id,multiplier,starts_at,ends_at,is_active,notes")
    .eq("membership_id", membership.id)
    .eq("is_active", true)
    .lte("starts_at", nowIso)
    .gte("ends_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (individualPromoErr) {
    return NextResponse.json(
      { error: individualPromoErr.message },
      { status: 500 }
    );
  }

  let appliedPromo: any = individualPromo || null;
  let promoType: "individual" | "global" | null = individualPromo
    ? "individual"
    : null;

  if (!appliedPromo) {
    const { data: globalPromos, error: globalPromoErr } = await sb
      .from("loyalty_global_promos")
      .select("*")
      .eq("is_active", true)
      .lte("starts_at", nowIso)
      .gte("ends_at", nowIso)
      .order("created_at", { ascending: false });

    if (globalPromoErr) {
      return NextResponse.json(
        { error: globalPromoErr.message },
        { status: 500 }
      );
    }

    appliedPromo =
      (globalPromos || []).find(
        (promo: any) =>
          promoScheduleMatches(promo, nowParts) &&
          promoTargetMatches(promo, membership, nowParts)
      ) || null;

    promoType = appliedPromo ? "global" : null;
  }

  const membershipMultiplier = getMembershipMultiplier(
    membership.membership_type
  );
  const promoMultiplier = appliedPromo ? Number(appliedPromo.multiplier || 1) : 1;

  const basePoints = Math.floor(euroAmount * membershipMultiplier);
  const points = Math.floor(basePoints * promoMultiplier);

  if (points <= 0) {
    return NextResponse.json(
      { error: "Importo troppo basso per generare punti" },
      { status: 400 }
    );
  }

  const notes = appliedPromo
    ? `Accredito punti staff · coefficiente ${
        membership.membership_type === "FITP" ? "FITP" : "ASC"
      } ${membershipMultiplier} · promo ${
        promoType === "individual" ? "individuale" : "globale"
      } x${promoMultiplier} · sede ${club}`
    : `Accredito punti staff · coefficiente ${
        membership.membership_type === "FITP" ? "FITP" : "ASC"
      } ${membershipMultiplier} · sede ${club}`;

  const { error: insertErr } = await sb.from("loyalty_transactions").insert({
    membership_id: membership.id,
    type: "earn",
    source: "club_payment",
    euro_amount: euroAmount,
    points_delta: points,
    created_by: session.sid,
    club,
    notes,
  });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const { data: allTransactions, error: txErr } = await sb
    .from("loyalty_transactions")
    .select("points_delta")
    .eq("membership_id", membership.id);

  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 });
  }

  const newBalance = (allTransactions ?? []).reduce(
    (sum, t) => sum + Number(t.points_delta ?? 0),
    0
  );

  return NextResponse.json({
    ok: true,
    points_added: points,
    base_points: basePoints,
    new_balance: newBalance,
    multiplier: membershipMultiplier,
    promo_multiplier: promoMultiplier,
    promo_applied: Boolean(appliedPromo),
    promo_type: promoType,
    promo_id: appliedPromo?.id ?? null,
    promo_title: appliedPromo?.title ?? null,
    club,
  });
}