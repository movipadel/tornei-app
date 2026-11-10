import { NextResponse } from "next/server";
import { guardOperatorPermission } from "@/lib/operatorAuthorization";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type Candidate = {
  player_identity_id: string | null;
  account_user_id: string | null;
  display_name: string;
  phone: string;
  email: string | null;
  gender: string | null;
  source: "Profilo MOVI" | "Identità sportiva" | "Account da collegare";
  alias_match?: boolean;
};

const phoneDigits = (value: string) => value.replace(/\D/g, "");
const canonicalPhoneDigits = (value: string) => {
  const digits = phoneDigits(value);
  return /^3\d{9}$/.test(digits) ? `39${digits}` : digits;
};
const normalizedName = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it");

export async function GET(request: Request) {
  const denied = await guardOperatorPermission("tournaments.manage");
  if (denied) return denied;
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  const digits = phoneDigits(q);
  const phoneQuery = q.replace(/[\d\s()+.\-]/g, "").length === 0;
  if (phoneQuery ? digits.length < 4 : q.length < 3) return NextResponse.json({ data: [] });
  const safe = q.replace(/[%_,()\\]/g, " ").replace(/\s+/g, " ").trim();
  if (!phoneQuery && safe.length < 3) return NextResponse.json({ data: [] });
  const db = supabaseAdmin();
  const term = phoneQuery ? digits : safe;

  const [players, accounts, aliases] = await Promise.all([
    db.from("player_identities").select("id,full_name,normalized_phone,gender,account_user_id")
      .eq("status", "active")
      .or(phoneQuery ? `normalized_phone.ilike.%${term}%` : `full_name.ilike.%${term}%`)
      .limit(36),
    db.from("users").select("id,full_name,phone,email,gender")
      .eq("identity_status", "active")
      .or(phoneQuery ? `phone.ilike.%${term}%` : `full_name.ilike.%${term}%,email.ilike.%${term}%`)
      .limit(36),
    phoneQuery ? Promise.resolve({ data: [], error: null }) : db.from("player_identity_identifiers")
      .select("player_identity_id,source_name")
      .ilike("source_name", `%${safe}%`).limit(24),
  ]);
  if (players.error || accounts.error || aliases.error) {
    console.error("Tournament player search failed", { players: players.error?.code, accounts: accounts.error?.code, aliases: aliases.error?.code });
    return NextResponse.json({ error: "Ricerca non disponibile" }, { status: 500 });
  }

  const aliasIds = [...new Set((aliases.data ?? []).map((row) => row.player_identity_id))];
  const aliasPlayers = aliasIds.length ? await db.from("player_identities")
    .select("id,full_name,normalized_phone,gender,account_user_id")
    .eq("status", "active").in("id", aliasIds).limit(24) : { data: [], error: null };
  if (aliasPlayers.error) return NextResponse.json({ error: "Ricerca non disponibile" }, { status: 500 });

  const playerMap = new Map((players.data ?? []).concat(aliasPlayers.data ?? []).map((row) => [row.id, row]));
  const accountIds = [...new Set([...playerMap.values()].map((row) => row.account_user_id).filter((id): id is string => Boolean(id)))];
  const linked = accountIds.length ? await db.from("users").select("id,full_name,phone,email,gender")
    .eq("identity_status", "active").in("id", accountIds) : { data: [], error: null };
  if (linked.error) return NextResponse.json({ error: "Ricerca non disponibile" }, { status: 500 });
  const allAccounts = new Map((accounts.data ?? []).concat(linked.data ?? []).map((row) => [row.id, row]));
  const linkedIds = [...new Set((accounts.data ?? []).map((row) => row.id))];
  const existingLinks = linkedIds.length ? await db.from("player_identities").select("id,account_user_id")
    .in("account_user_id", linkedIds).neq("status", "merged") : { data: [], error: null };
  if (existingLinks.error) return NextResponse.json({ error: "Ricerca non disponibile" }, { status: 500 });
  const missingLinkedIds = (existingLinks.data ?? []).map((row) => row.id).filter((id) => !playerMap.has(id));
  const accountPlayers = missingLinkedIds.length ? await db.from("player_identities")
    .select("id,full_name,normalized_phone,gender,account_user_id")
    .eq("status", "active").in("id", missingLinkedIds) : { data: [], error: null };
  if (accountPlayers.error) return NextResponse.json({ error: "Ricerca non disponibile" }, { status: 500 });
  for (const player of accountPlayers.data ?? []) playerMap.set(player.id, player);
  const linkedPlayerIds = new Set((existingLinks.data ?? []).map((row) => row.account_user_id));
  const data: Candidate[] = [...playerMap.values()].map((player) => {
    const account = player.account_user_id ? allAccounts.get(player.account_user_id) : null;
    return {
      player_identity_id: player.id, account_user_id: account?.id ?? null,
      display_name: player.full_name, phone: player.normalized_phone, email: account?.email ?? null,
      gender: player.gender ?? null, source: account ? "Profilo MOVI" : "Identità sportiva",
      alias_match: aliasIds.includes(player.id),
    };
  });
  for (const account of accounts.data ?? []) {
    if (linkedPlayerIds.has(account.id)) continue;
    data.push({ player_identity_id: null, account_user_id: account.id,
      display_name: account.full_name, phone: account.phone, email: account.email,
      gender: account.gender, source: "Account da collegare" });
  }
  const key = normalizedName(q);
  const rank = (candidate: Candidate) => {
    if (phoneQuery && canonicalPhoneDigits(candidate.phone) === canonicalPhoneDigits(q)) return 0;
    if (!phoneQuery && normalizedName(candidate.display_name) === key) return 1;
    if (!phoneQuery && normalizedName(candidate.display_name).startsWith(key)) return 2;
    if (candidate.alias_match) return 3;
    return 4;
  };
  data.sort((a, b) => rank(a) - rank(b) || a.display_name.localeCompare(b.display_name, "it"));
  return NextResponse.json({ data: data.slice(0, 12) });
}
