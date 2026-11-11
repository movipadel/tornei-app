import { NextResponse } from "next/server";
import { getUserIdFromCookie } from "@/lib/userAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "Numero non disponibile";
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getUserIdFromCookie();
  if (!uid) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: tournament } = await sb.from("tournaments")
    .select("id,type,registrations_open").eq("id", id).maybeSingle();
  if (!tournament || tournament.type !== "Coppie fisse" || !tournament.registrations_open) {
    return NextResponse.json({ data: [] });
  }
  const term = new URL(req.url).searchParams.get("q")?.trim().replace(/\s+/g, " ") ?? "";
  // Require a meaningful query and keep PostgREST filter metacharacters out.
  if (term.length < 3 || term.length > 80 || /[%_\\]/.test(term)) {
    return NextResponse.json({ data: [] });
  }
  const { data: account } = await sb.from("users").select("id,identity_status")
    .eq("id", uid).maybeSingle();
  if (account?.identity_status !== "active") {
    return NextResponse.json({ data: [] });
  }
  const digits = term.replace(/\D/g, "");
  const nameSearch = sb.from("player_identities")
    .select("id,full_name,normalized_phone,account_user_id")
    .eq("status", "active").ilike("full_name", `%${term}%`).limit(9);
  const [names, phones] = await Promise.all([
    nameSearch,
    digits.length >= 4
      ? sb.from("player_identities")
        .select("id,full_name,normalized_phone,account_user_id")
        .eq("status", "active").ilike("normalized_phone", `%${digits}%`).limit(9)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (names.error || phones.error) {
    return NextResponse.json({ error: "Ricerca non disponibile" }, { status: 500 });
  }
  const candidates = Array.from(new Map([...(names.data ?? []), ...(phones.data ?? [])]
    .map((row) => [row.id, row])).values());
  const linkedIds = candidates.map((row) => row.account_user_id).filter((id): id is string => Boolean(id));
  const { data: linkedAccounts, error } = linkedIds.length
    ? await sb.from("users").select("id,identity_status").in("id", linkedIds)
    : { data: [], error: null };
  if (error) return NextResponse.json({ error: "Ricerca non disponibile" }, { status: 500 });
  const active = new Set((linkedAccounts ?? []).filter((row) => row.identity_status === "active").map((row) => row.id));
  const data = candidates
    .filter((row) => row.account_user_id !== uid && (!row.account_user_id || active.has(row.account_user_id)))
    .slice(0, 8)
    .map((row) => ({
      player_identity_id: row.id,
      display_name: row.full_name,
      masked_phone: maskPhone(row.normalized_phone),
    }));
  return NextResponse.json({ data });
}
