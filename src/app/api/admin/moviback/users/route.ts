import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardOperatorPermission } from "@/lib/operatorAuthorization";
import { getMovibackBalances } from "@/lib/movibackBalanceServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await guardOperatorPermission("moviback.manage");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const q = String(searchParams.get("q") || "").trim();

  const sb = supabaseAdmin();

  let query = sb
    .from("loyalty_memberships")
    .select(`
      id,
      user_id,
      status,
      membership_code,
      tax_code,
      membership_type,
      fee_points,
      fee_paid,
      has_existing_membership,
      existing_membership_type,
      existing_membership_number,
      approved_at,
      suspended_at,
      suspension_reason,
      created_at,
      updated_at,
      users (
        id,
        full_name,
        phone,
        email,
        gender,
        created_at
      )
    `)
    .order("created_at", { ascending: false });

  if (q) {
    query = query.or(
      `membership_code.ilike.%${q}%,tax_code.ilike.%${q}%,users.full_name.ilike.%${q}%,users.phone.ilike.%${q}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];

  const membershipIds = rows.map((r: any) => r.id);

  const balances = await getMovibackBalances(sb, membershipIds);

  const enriched = rows.map((row: any) => ({
    ...row,
    points_balance: balances.get(row.id) ?? 0,
  }));

  return NextResponse.json({ data: enriched });
}
